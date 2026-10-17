import { createHmac } from "node:crypto";
import { sql } from "drizzle-orm";
import type { Tx } from "@amax/db";
import type { ServiceContext } from "./authorize";
import { canonical, GENESIS, keyed, sha256, walkChain, type ChainResult } from "./chain-key";
import { currentTrace } from "./trace-context";

export { canonical, GENESIS, type ChainResult };

/** The 002 sensitivity classes: one list for types, policy screens and checks. */
export const SENSITIVITY_CLASSES = ["pay", "health", "bank", "performance", "candidate"] as const;
export type Sensitivity = (typeof SENSITIVITY_CLASSES)[number];

// Classified fields never reach the audit: the field name stays, the value becomes a keyed hash.
export function redact(record: Record<string, unknown> | null | undefined, sensitive: Record<string, Sensitivity>, key: string) {
  if (!record) return null;
  const out: Record<string, unknown> = { ...record };
  for (const [field, cls] of Object.entries(sensitive)) {
    if (field in out && out[field] !== null && out[field] !== undefined) {
      out[field] = { $class: cls, $hmac: createHmac("sha256", key).update(canonical(out[field])).digest("hex") };
    }
  }
  return out;
}

export type AuditBody = {
  tenantId: string;
  seq: number;
  occurredAt: string;
  actor: string;
  onBehalfOf: string | null;
  source: string;
  action: string;
  resource: string;
  resourceId: string | null;
  before: unknown;
  after: unknown;
};

/** Chain v1 (rows before 050): the raw values are in the hash. */
export const chainHash = (prevHash: string, body: AuditBody) => sha256(prevHash, body);

type Entry = { action: string; resource: string; resourceId?: string | null; before?: unknown; after?: unknown };
type Row = Record<string, unknown>;

// Hash exactly what jsonb will hold: undefined keys dropped, dates as strings.
const asStored = (v: unknown) => (v === undefined || v === null ? null : JSON.parse(JSON.stringify(v)));

// Chain v2 (050): identifying values enter the hash only as keyed hashes, so erasure (032) can null
// the raw value and the chain still verifies; the trace id is in the hash too.
const v2Body = (r: Row) => ({
  v: 2, tenantId: r.tenant_id, seq: Number(r.seq), occurredAt: new Date(r.occurred_at as string).toISOString(), traceId: r.trace_id ?? null,
  source: r.source, action: r.action, resource: r.resource,
  actorKey: r.actor_key, onBehalfOfKey: r.on_behalf_of_key ?? null, resourceIdKey: r.resource_id_key ?? null, beforeKey: r.before_key ?? null, afterKey: r.after_key ?? null,
});

const v1Body = (r: Row): AuditBody => ({
  tenantId: r.tenant_id as string, seq: Number(r.seq), occurredAt: new Date(r.occurred_at as string).toISOString(),
  actor: r.actor as string, onBehalfOf: (r.on_behalf_of as string | null) ?? null, source: r.source as string, action: r.action as string,
  resource: r.resource as string, resourceId: (r.resource_id as string | null) ?? null, before: r.before ?? null, after: r.after ?? null,
});

const AUDIT_SPEC = {
  body: (r: Row) => (Number(r.chain_v) === 2 ? v2Body(r) : v1Body(r)),
  keyedRow: (r: Row) => Number(r.chain_v) === 2,
  pairs: (r: Row): [unknown, unknown][] => [[r.actor, r.actor_key], [r.on_behalf_of, r.on_behalf_of_key], [r.resource_id, r.resource_id_key], [r.before, r.before_key], [r.after, r.after_key]],
};

// Appends one audit row inside the caller's transaction. The advisory lock serialises writers per
// tenant so seq and prev_hash form one unbroken chain.
export async function appendAudit(tx: Tx, ctx: ServiceContext, entry: Entry) {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${ctx.tenantId}, 0))`);
  const [last] = await tx.execute(sql`select seq, hash from core.audit_event where tenant_id = ${ctx.tenantId} order by seq desc limit 1`);
  const trace = currentTrace();
  const row: Row = {
    tenant_id: ctx.tenantId, seq: last ? Number(last.seq) + 1 : 1, occurred_at: new Date().toISOString(),
    trace_id: trace?.tenantId === ctx.tenantId ? trace.traceId : null, actor: ctx.actor.id, on_behalf_of: ctx.onBehalfOf ?? null,
    source: ctx.source, action: entry.action, resource: entry.resource, resource_id: entry.resourceId ?? null, before: asStored(entry.before), after: asStored(entry.after),
  };
  Object.assign(row, { actor_key: keyed(row.actor), on_behalf_of_key: keyed(row.on_behalf_of), resource_id_key: keyed(row.resource_id), before_key: keyed(row.before), after_key: keyed(row.after) });
  const prevHash = (last?.hash as string | undefined) ?? GENESIS;
  const hash = sha256(prevHash, v2Body(row));
  await tx.execute(sql`insert into core.audit_event
    (tenant_id, seq, occurred_at, trace_id, chain_v, actor, actor_key, on_behalf_of, on_behalf_of_key, source, action, resource, resource_id, resource_id_key, before, before_key, after, after_key, prev_hash, hash)
    values (${ctx.tenantId}, ${row.seq}, ${row.occurred_at}, ${row.trace_id}, 2, ${row.actor}, ${row.actor_key}, ${row.on_behalf_of}, ${row.on_behalf_of_key}, ${row.source}, ${row.action},
            ${row.resource}, ${row.resource_id}, ${row.resource_id_key}, ${JSON.stringify(row.before)}::jsonb, ${row.before_key}, ${JSON.stringify(row.after)}::jsonb, ${row.after_key}, ${prevHash}, ${hash})`);
  return { seq: row.seq as number, hash };
}

// Recomputes every hash for a tenant. Any edit, deletion or reordering breaks it.
export async function verifyAuditChain(tx: Tx, tenantId: string, key?: string): Promise<ChainResult> {
  const rows = await tx.execute(sql`select * from core.audit_event where tenant_id = ${tenantId} order by seq`);
  return walkChain(rows, AUDIT_SPEC, key);
}
