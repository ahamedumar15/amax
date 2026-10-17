import { sql } from "drizzle-orm";
import type { Tx } from "@amax/db";
import { memoryCache } from "./adapters/cache";
import { verifyAuditChain, type ChainResult } from "./audit";
import { verifyTraceChain } from "./trace";

export type ChainName = "audit" | "trace";
export type AuditEntry = { chain: ChainName; seq: number; at: string; actor: string | null; onBehalfOf: string | null; source: string; what: string; tool: string | null; record: string | null; traceId: string | null };
export type AuditFilter = { query?: string; chain?: ChainName; seq?: number; traceId?: string; sinceDays?: number; limit?: number };

const iso = (v: unknown) => new Date(v as string).toISOString();
const entry = (r: Record<string, unknown>): AuditEntry => ({
  chain: r.chain as ChainName, seq: Number(r.seq), at: iso(r.at), actor: (r.actor as string | null) ?? null, onBehalfOf: (r.on_behalf_of as string | null) ?? null,
  source: r.source as string, what: r.what as string, tool: (r.tool as string | null) ?? null, record: (r.record as string | null) ?? null, traceId: (r.trace_id as string | null) ?? null,
});

const like = (q: string) => `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;

/** Audit rows and trace steps, newest first. Read only; the caller's transaction has the tenant set. */
export async function searchAudit(tx: Tx, tenantId: string, f: AuditFilter = {}): Promise<AuditEntry[]> {
  const rows = await tx.execute(sql`select * from (
      select 'audit' as chain, seq, occurred_at as at, actor, on_behalf_of, source, action as what, null::text as tool,
             resource || coalesce(' ' || resource_id, '') as record, trace_id from core.audit_event where tenant_id = ${tenantId}
      union all
      select 'trace', seq, occurred_at, actor, on_behalf_of, source, kind, tool, record_id, trace_id from core.trace_event where tenant_id = ${tenantId}
    ) e where true
    ${f.chain ? sql`and chain = ${f.chain}` : sql``}
    ${f.seq !== undefined ? sql`and seq = ${f.seq}` : sql``}
    ${f.traceId ? sql`and trace_id = ${f.traceId}::uuid` : sql``}
    ${f.sinceDays ? sql`and at >= now() - make_interval(days => ${f.sinceDays})` : sql``}
    ${f.query ? sql`and concat_ws(' ', actor, on_behalf_of, what, tool, record, trace_id::text) ilike ${like(f.query)}` : sql``}
    order by at desc, seq desc limit ${Math.min(f.limit ?? 100, 500)}`);
  return rows.map(entry);
}

export type TraceStepView = AuditEntry & { model: string | null; tokens: number | null; costUsd: number | null; detail: Record<string, unknown> };

/** One trace as a timeline: its steps, its audited writes and the model calls they point at. */
export async function getTrace(tx: Tx, tenantId: string, traceId: string): Promise<TraceStepView[]> {
  const rows = await tx.execute(sql`select 'trace' as chain, t.seq, t.occurred_at as at, t.actor, t.on_behalf_of, t.source, t.kind as what, t.tool, t.record_id as record, t.trace_id, t.detail,
      c.model, c.input_tokens + c.output_tokens as tokens, c.cost_usd
    from core.trace_event t left join ai.call c on t.kind = 'model_call' and c.id::text = t.record_id
    where t.tenant_id = ${tenantId} and t.trace_id = ${traceId}::uuid
    union all
    select 'audit', seq, occurred_at, actor, on_behalf_of, source, action, null, resource || coalesce(' ' || resource_id, ''), trace_id, '{}'::jsonb, null, null, null
    from core.audit_event where tenant_id = ${tenantId} and trace_id = ${traceId}::uuid
    order by at, chain desc, seq`);
  return rows.map((r) => ({ ...entry(r), model: (r.model as string | null) ?? null, tokens: r.tokens === null ? null : Number(r.tokens), costUsd: r.cost_usd === null ? null : Number(r.cost_usd), detail: (r.detail as Record<string, unknown>) ?? {} }));
}

export type AuditStatus = { audit: ChainResult; trace: ChainResult; verifiedAt: string; lastExport: { at: string; day: string; retainUntil: string } | null; deniedToday: number };

const verified = memoryCache();

/** Both chains' state. The chain walk is cached per tenant; `fresh` ("Verify now") runs it again. */
export async function auditStatus(tx: Tx, tenantId: string, opts: { fresh?: boolean } = {}): Promise<AuditStatus> {
  type Checked = Pick<AuditStatus, "audit" | "trace" | "verifiedAt">;
  let checked = opts.fresh ? undefined : await verified.get<Checked>(tenantId);
  if (!checked) {
    checked = { audit: await verifyAuditChain(tx, tenantId), trace: await verifyTraceChain(tx, tenantId), verifiedAt: new Date().toISOString() };
    await verified.set(tenantId, checked, 3600);
  }
  const [exp] = await tx.execute(sql`select occurred_at, after from core.audit_event where tenant_id = ${tenantId} and action = 'core.audit.export' order by seq desc limit 1`);
  const [{ n }] = await tx.execute(sql`select count(*)::int as n from core.trace_event where tenant_id = ${tenantId} and kind = 'tool_call'
    and detail ->> 'outcome' = 'denied' and occurred_at >= date_trunc('day', now())`);
  const after = exp?.after as { day?: string; retainUntil?: string } | null | undefined;
  return { ...checked, lastExport: exp ? { at: iso(exp.occurred_at), day: after?.day ?? "", retainUntil: after?.retainUntil ?? "" } : null, deniedToday: Number(n) };
}
