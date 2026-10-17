import { createHash, createHmac } from "node:crypto";
import { sql } from "drizzle-orm";
import type { Tx } from "@amax/db";
import type { ServiceContext } from "./authorize";

/** The 002 sensitivity classes: one list for types, policy screens and checks. */
export const SENSITIVITY_CLASSES = ["pay", "health", "bank", "performance", "candidate"] as const;
export type Sensitivity = (typeof SENSITIVITY_CLASSES)[number];

export const GENESIS = "0".repeat(64);

// Sorted keys so the hash survives jsonb's key reordering.
export function canonical(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value ?? null);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  return `{${Object.keys(value).sort().map((k) => `${JSON.stringify(k)}:${canonical((value as Record<string, unknown>)[k])}`).join(",")}}`;
}

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

export const chainHash = (prevHash: string, body: AuditBody) => createHash("sha256").update(prevHash).update(canonical(body)).digest("hex");

type Entry = { action: string; resource: string; resourceId?: string | null; before?: unknown; after?: unknown };

// Appends one audit row inside the caller's transaction. The advisory lock serialises writers per
// tenant so seq and prev_hash form one unbroken chain.
export async function appendAudit(tx: Tx, ctx: ServiceContext, entry: Entry) {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${ctx.tenantId}, 0))`);
  const [last] = await tx.execute(sql`select seq, hash from core.audit_event where tenant_id = ${ctx.tenantId} order by seq desc limit 1`);
  const body: AuditBody = {
    tenantId: ctx.tenantId,
    seq: last ? Number(last.seq) + 1 : 1,
    occurredAt: new Date().toISOString(),
    actor: ctx.actor.id,
    onBehalfOf: ctx.onBehalfOf ?? null,
    source: ctx.source,
    action: entry.action,
    resource: entry.resource,
    resourceId: entry.resourceId ?? null,
    before: entry.before ?? null,
    after: entry.after ?? null,
  };
  const prevHash = (last?.hash as string | undefined) ?? GENESIS;
  const hash = chainHash(prevHash, body);
  await tx.execute(sql`insert into core.audit_event
    (tenant_id, seq, occurred_at, actor, on_behalf_of, source, action, resource, resource_id, before, after, prev_hash, hash)
    values (${body.tenantId}, ${body.seq}, ${body.occurredAt}, ${body.actor}, ${body.onBehalfOf}, ${body.source}, ${body.action},
            ${body.resource}, ${body.resourceId}, ${JSON.stringify(body.before)}::jsonb, ${JSON.stringify(body.after)}::jsonb, ${prevHash}, ${hash})`);
  return { seq: body.seq, hash };
}

export type ChainResult = { ok: true; length: number; head: string } | { ok: false; brokenAt: number; reason: string };

// Recomputes every hash for a tenant. Any edit, deletion or reordering breaks it.
export async function verifyAuditChain(tx: Tx, tenantId: string): Promise<ChainResult> {
  const rows = await tx.execute(sql`select * from core.audit_event where tenant_id = ${tenantId} order by seq`);
  let prev = GENESIS;
  let expectedSeq = 1;
  for (const r of rows) {
    const seq = Number(r.seq);
    if (seq !== expectedSeq) return { ok: false, brokenAt: expectedSeq, reason: "missing row" };
    if (r.prev_hash !== prev) return { ok: false, brokenAt: seq, reason: "prev_hash mismatch" };
    const body: AuditBody = {
      tenantId: r.tenant_id as string,
      seq,
      occurredAt: new Date(r.occurred_at as string).toISOString(),
      actor: r.actor as string,
      onBehalfOf: (r.on_behalf_of as string | null) ?? null,
      source: r.source as string,
      action: r.action as string,
      resource: r.resource as string,
      resourceId: (r.resource_id as string | null) ?? null,
      before: r.before ?? null,
      after: r.after ?? null,
    };
    if (chainHash(prev, body) !== r.hash) return { ok: false, brokenAt: seq, reason: "hash mismatch" };
    prev = r.hash as string;
    expectedSeq++;
  }
  return { ok: true, length: rows.length, head: prev };
}
