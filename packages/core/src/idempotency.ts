import { AsyncLocalStorage } from "node:async_hooks";
import { sql } from "drizzle-orm";
import { withTenant, type Db, type Tx } from "@amax/db";
import { ForbiddenError } from "./authorize";
import type { JobDef } from "./module";

// Idempotency keys for writes a caller may retry (the chat's "Add it"), redesigned after review
// round 8 and tightened by 043. The contract:
//   1. A keyed call makes exactly one top-level service write. Every defineService call in the scope
//      is counted; the caller treats anything but 1 as an unknown outcome. A caller that declares the
//      service (chat declares the tool's) gets any other service refused before it writes.
//   2. A service called from inside another service's run (a contract command) is nested: it takes a
//      key derived from the outer one (`<outer>/1`, `<outer>/2`, … in call order) and isn't counted as
//      a top-level write. Its commits are counted apart, so a caller can tell a partial write.
//   3. The caller looks the key up before anything runs. defineService claims it inside the write's
//      own transaction and settles it there, so the write and its record commit together; a
//      concurrent attempt waits on the key, then gets the stored outcome as ReplayedError or
//      CancelledByKeyError, never as a value cast to the service's result.
//   4. Only a replay record is stored (the resource id and key the write returned), never the result
//      itself. A scope opened with an actor (chat's, for its person) binds the record to that actor,
//      and a lookup for anyone else is refused. Records are pruned after KEY_DAYS.

type Scope = { key: string; writes: number; nested: number; service?: string; by?: string };
const scope = new AsyncLocalStorage<Scope>();
const nest = new AsyncLocalStorage<{ base: string; n: number }>();

export type KeyedRun<T> = { ok: true; value: T; writes: number; nested: number } | { ok: false; error: unknown; writes: number; nested: number };

/**
 * Runs `fn` under `key` and reports its top-level and nested service writes, whether it returned or
 * threw. `service`: the one service that may write; `by`: the actor its records are bound to.
 */
export async function withIdempotency<T>(key: string, fn: () => Promise<T>, opts: { service?: string; by?: string } = {}): Promise<KeyedRun<T>> {
  const s: Scope = { key, writes: 0, nested: 0, ...opts };
  try {
    return { ok: true, value: await scope.run(s, fn), writes: s.writes, nested: s.nested };
  } catch (error) {
    return { ok: false, error, writes: s.writes, nested: s.nested };
  }
}

/** A keyed call that declared its service reached a different one: refused before it wrote. */
export class UndeclaredWriteError extends Error {
  readonly retryable = false;
  constructor(declared: string, called: string) {
    super(`${called} isn't the declared write ${declared}`);
    this.name = "UndeclaredWriteError";
  }
}

export type KeyTaken = { key: string; nested: boolean; by?: string };

/** Called by defineService for every write: its key (nested or the scope's), or null for a later top-level write. */
export function takeIdempotencyKey(service: string): KeyTaken | null {
  const s = scope.getStore();
  if (!s) return null;
  const n = nest.getStore();
  if (n) return { key: `${n.base}/${++n.n}`, nested: true, by: s.by };
  if (s.service && s.service !== service) throw new UndeclaredWriteError(s.service, service);
  s.writes++;
  return s.writes === 1 ? { key: s.key, nested: false, by: s.by } : null;
}

/** Runs a keyed service's body so the services it calls are nested under `key`. */
export const nestUnder = <T>(key: string, fn: () => Promise<T>) => nest.run({ base: key, n: 0 }, fn);

/** A nested write committed: the outer write may still fail, leaving it behind. */
export const noteNestedCommit = () => {
  const s = scope.getStore();
  if (s) s.nested++;
};

/** What a replay returns: enough to say what was done, nothing more. */
export type Replay = { replayed: true; resourceId: string | null; key: string | null };
/** `by`: the actor the record is bound to, if its scope had one (043 AC-5). */
export type KeyOutcome = ({ done: Replay } | { cancelled: true }) & { by?: string };

export const replayOf = (resourceId: string | null | undefined, result: unknown): Replay => ({
  replayed: true,
  resourceId: resourceId ?? null,
  key: typeof (result as { key?: unknown } | null)?.key === "string" ? (result as { key: string }).key : null,
});

/** The write was cancelled under this key before it ran; it never will. */
export class CancelledByKeyError extends Error {
  readonly retryable = false;
  constructor(key: string) {
    super(`${key} was cancelled`);
    this.name = "CancelledByKeyError";
  }
}

/** The write already happened under this key; `replay` says what it made. */
export class ReplayedError extends Error {
  readonly retryable = false;
  constructor(readonly key: string, readonly replay: Replay) {
    super(`${key} was already done`);
    this.name = "ReplayedError";
  }
}

/** The stored outcome of a keyed call, found by walking the cause chain of what it threw. */
export function keyedOutcome(e: unknown, depth = 0): ReplayedError | CancelledByKeyError | null {
  if (e instanceof ReplayedError || e instanceof CancelledByKeyError) return e;
  const cause = (e as { cause?: unknown } | null)?.cause;
  return typeof e === "object" && e !== null && cause !== undefined && depth < 5 ? keyedOutcome(cause, depth + 1) : null;
}

// A bound record is never read back to another actor: a key can't be used to read past authorize.
const boundTo = (outcome: KeyOutcome, key: string, by: string | undefined) => {
  if (outcome.by !== undefined && outcome.by !== by) throw new ForbiddenError("idempotency.replay", key);
  return outcome;
};

/** The stored outcome for `key`, if any (read outside any write). Refused when it is bound to someone other than `by`. */
export async function lookupKey(db: Db, tenantId: string, key: string, by?: string): Promise<KeyOutcome | null> {
  const [row] = await withTenant(db, tenantId, (tx) => tx.execute(sql`select outcome from core.idempotency where key = ${key} and outcome is not null`));
  return row ? boundTo(row.outcome as KeyOutcome, key, by) : null;
}

/**
 * Claims `key` (bound to `by`, if given) in this transaction with `outcome` (null: settled before commit). Returns
 * null when claimed, or what an earlier attempt stored. Waits while another transaction holds the key.
 */
export async function claimKey(tx: Tx, tenantId: string, key: string, outcome: KeyOutcome | null, by?: string): Promise<KeyOutcome | null> {
  const stored = outcome && { ...outcome, by };
  const [mine] = await tx.execute(sql`insert into core.idempotency (tenant_id, key, outcome) values (${tenantId}, ${key}, ${JSON.stringify(stored)}::jsonb)
    on conflict (tenant_id, key) do nothing returning key`);
  if (mine) return null;
  const [row] = await tx.execute(sql`select outcome from core.idempotency where tenant_id = ${tenantId} and key = ${key}`);
  if (!row?.outcome) throw new Error(`${key} is held with no outcome`);
  return boundTo(row.outcome as KeyOutcome, key, by);
}

export const settleKey = (tx: Tx, tenantId: string, key: string, outcome: KeyOutcome, by?: string) =>
  tx.execute(sql`update core.idempotency set outcome = ${JSON.stringify({ ...outcome, by })}::jsonb where tenant_id = ${tenantId} and key = ${key}`);

/** Replay records are kept this long: far beyond any retry, short enough not to pile up. */
export const KEY_DAYS = 30;

export const pruneKeysJob: JobDef = {
  name: "core.idempotency.prune",
  cron: "40 0 * * *",
  async run({ tx }) {
    await tx.execute(sql`delete from core.idempotency where created_at < now() - make_interval(days => ${KEY_DAYS})`);
  },
};

// Errors a retry can't fix. One classifier for every caller, walking the cause chain: an explicit
// `retryable: false`, the known permanent classes, permanent codes, and Postgres integrity errors.
const PERMANENT_NAMES = new Set(["ForbiddenError", "ScopeError", "ValidationError", "ZodError", "ToolError", "KeyTakenError", "CancelledByKeyError", "ReplayedError", "UndeclaredWriteError"]);
const PERMANENT_CODES = new Set(["forbidden", "invalid_input", "not_found"]);

export function retryable(e: unknown, depth = 0): boolean {
  if (typeof e !== "object" || e === null || depth > 5) return true;
  const { retryable: flag, name, code, cause } = e as { retryable?: unknown; name?: unknown; code?: unknown; cause?: unknown };
  if (flag === false) return false;
  if (typeof name === "string" && PERMANENT_NAMES.has(name)) return false;
  if (typeof code === "string" && (PERMANENT_CODES.has(code) || /^23\d{3}$/.test(code))) return false;
  return cause === undefined ? true : retryable(cause, depth + 1);
}
