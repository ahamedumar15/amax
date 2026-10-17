import { AsyncLocalStorage } from "node:async_hooks";
import { sql } from "drizzle-orm";
import { withTenant, type Db, type Tx } from "@amax/db";
import type { JobDef } from "./module";

// Idempotency keys for writes a caller may retry (the chat's "Add it"), redesigned after review
// round 8. The contract:
//   1. A keyed call must make exactly one service write. Every defineService call in the scope is
//      counted; the caller checks the count and treats anything but 1 as an unknown outcome.
//   2. The key is looked up before anything else: before authorize and validation in defineService,
//      and before the tool runs in the caller. A stored outcome is returned as it is.
//   3. The key is claimed inside the write's own transaction and settled there, so the write and
//      its record commit together; a concurrent attempt waits on the key and then reads the record.
//   4. Only a replay record is stored (the resource id and key the write returned), never the
//      result itself, and records are pruned after KEY_DAYS.

type Scope = { key: string; writes: number };
const scope = new AsyncLocalStorage<Scope>();

/** Runs `fn` under `key` and reports how many service writes it made, whether it returned or threw. */
export async function withIdempotency<T>(key: string, fn: () => Promise<T>): Promise<{ ok: true; value: T; writes: number } | { ok: false; error: unknown; writes: number }> {
  const s: Scope = { key, writes: 0 };
  try {
    return { ok: true, value: await scope.run(s, fn), writes: s.writes };
  } catch (error) {
    return { ok: false, error, writes: s.writes };
  }
}

/** Called by defineService for every write: the key for the first one, null for any later one. */
export function takeIdempotencyKey(): string | null {
  const s = scope.getStore();
  if (!s) return null;
  s.writes++;
  return s.writes === 1 ? s.key : null;
}

/** What a replay returns: enough to say what was done, nothing more. */
export type Replay = { replayed: true; resourceId: string | null; key: string | null };
export type KeyOutcome = { done: Replay } | { cancelled: true };

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

/** The stored outcome for `key`, if any (read outside any write). */
export async function lookupKey(db: Db, tenantId: string, key: string): Promise<KeyOutcome | null> {
  const [row] = await withTenant(db, tenantId, (tx) => tx.execute(sql`select outcome from core.idempotency where key = ${key} and outcome is not null`));
  return (row?.outcome as KeyOutcome | undefined) ?? null;
}

/**
 * Claims `key` in this transaction with `outcome` (null: settled before commit). Returns null when
 * claimed, or what an earlier attempt stored. Waits while another transaction holds the key.
 */
export async function claimKey(tx: Tx, tenantId: string, key: string, outcome: KeyOutcome | null): Promise<KeyOutcome | null> {
  const [mine] = await tx.execute(sql`insert into core.idempotency (tenant_id, key, outcome) values (${tenantId}, ${key}, ${JSON.stringify(outcome)}::jsonb)
    on conflict (tenant_id, key) do nothing returning key`);
  if (mine) return null;
  const [row] = await tx.execute(sql`select outcome from core.idempotency where tenant_id = ${tenantId} and key = ${key}`);
  return row.outcome as KeyOutcome;
}

export const settleKey = (tx: Tx, tenantId: string, key: string, outcome: KeyOutcome) =>
  tx.execute(sql`update core.idempotency set outcome = ${JSON.stringify(outcome)}::jsonb where tenant_id = ${tenantId} and key = ${key}`);

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
const PERMANENT_NAMES = new Set(["ForbiddenError", "ScopeError", "ValidationError", "ZodError", "ToolError", "KeyTakenError", "CancelledByKeyError"]);
const PERMANENT_CODES = new Set(["forbidden", "invalid_input", "not_found"]);

export function retryable(e: unknown, depth = 0): boolean {
  if (typeof e !== "object" || e === null || depth > 5) return true;
  const { retryable: flag, name, code, cause } = e as { retryable?: unknown; name?: unknown; code?: unknown; cause?: unknown };
  if (flag === false) return false;
  if (typeof name === "string" && PERMANENT_NAMES.has(name)) return false;
  if (typeof code === "string" && (PERMANENT_CODES.has(code) || /^23\d{3}$/.test(code))) return false;
  return cause === undefined ? true : retryable(cause, depth + 1);
}
