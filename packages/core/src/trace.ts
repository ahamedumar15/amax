import { sql } from "drizzle-orm";
import { withTenant, type Db, type Tx } from "@amax/db";
import { GENESIS, keyed, sha256, walkChain, type ChainResult } from "./chain-key";
import { logError } from "./log";
import { getRuntime } from "./service";
import { currentTrace, type Trace } from "./trace-context";

export type TraceKind = "turn" | "model_call" | "tool_call" | "pending" | "decided" | "mcp_call" | "job_run";
/** Metadata only: tool names, record ids, a keyed hash of the arguments. Never prompt or record content. */
export type TraceStep = { kind: TraceKind; tool?: string; recordId?: string | null; args?: unknown; detail?: Record<string, string | number | boolean | null> };

type Row = Record<string, unknown>;

const body = (r: Row) => ({
  tenantId: r.tenant_id, seq: Number(r.seq), occurredAt: new Date(r.occurred_at as string).toISOString(), traceId: r.trace_id, kind: r.kind, source: r.source,
  actorKey: r.actor_key ?? null, onBehalfOfKey: r.on_behalf_of_key ?? null, tool: r.tool ?? null, recordKey: r.record_key ?? null, argsKey: r.args_key ?? null, detail: r.detail ?? {},
});

const TRACE_SPEC = { body, pairs: (r: Row): [unknown, unknown][] => [[r.actor, r.actor_key], [r.on_behalf_of, r.on_behalf_of_key], [r.record_id, r.record_key]] };

// Appends one step to the tenant's trace chain, in the caller's transaction. Its own advisory lock
// key (seed 1), so it never waits on an audit writer.
export async function appendTrace(tx: Tx, trace: Trace, step: TraceStep) {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${trace.tenantId}, 1))`);
  const [last] = await tx.execute(sql`select seq, hash from core.trace_event where tenant_id = ${trace.tenantId} order by seq desc limit 1`);
  const row: Row = {
    tenant_id: trace.tenantId, seq: last ? Number(last.seq) + 1 : 1, occurred_at: new Date().toISOString(), trace_id: trace.traceId, kind: step.kind, source: trace.source,
    actor: trace.actor, actor_key: keyed(trace.actor), on_behalf_of: trace.onBehalfOf ?? null, on_behalf_of_key: keyed(trace.onBehalfOf ?? null),
    tool: step.tool ?? null, record_id: step.recordId ?? null, record_key: keyed(step.recordId ?? null), args_key: keyed(step.args ?? null), detail: JSON.parse(JSON.stringify(step.detail ?? {})),
  };
  const prevHash = (last?.hash as string | undefined) ?? GENESIS;
  const hash = sha256(prevHash, body(row));
  await tx.execute(sql`insert into core.trace_event (tenant_id, seq, occurred_at, trace_id, kind, source, actor, actor_key, on_behalf_of, on_behalf_of_key, tool, record_id, record_key, args_key, detail, prev_hash, hash)
    values (${row.tenant_id}, ${row.seq}, ${row.occurred_at}, ${row.trace_id}, ${row.kind}, ${row.source}, ${row.actor}, ${row.actor_key}, ${row.on_behalf_of}, ${row.on_behalf_of_key},
            ${row.tool}, ${row.record_id}, ${row.record_key}, ${row.args_key}, ${JSON.stringify(row.detail)}::jsonb, ${prevHash}, ${hash})`);
  return { seq: row.seq as number, hash };
}

/**
 * Records a step in its own short transaction, best-effort (053): a trace-store failure is logged and
 * never thrown, so it can't change the outcome a person or the model is told. Resolves false only when
 * the step couldn't be written; a caller whose next action depends on the step checks that.
 */
export async function traceStepIn(db: Db, trace: Trace, step: TraceStep): Promise<boolean> {
  try {
    await withTenant(db, trace.tenantId, (tx) => appendTrace(tx, trace, step));
    return true;
  } catch (e) {
    logError(`trace.${step.kind}${step.tool ? ` ${step.tool}` : ""}`, e);
    return false;
  }
}

/** A step of the current trace, best-effort (see traceStepIn); outside a trace it does nothing. */
export async function traceStep(step: TraceStep): Promise<boolean> {
  const trace = currentTrace();
  return trace ? traceStepIn(getRuntime().db, trace, step) : true;
}

/**
 * The one fail-closed step: it throws when the step can't be written. Only for a step that must exist
 * before a write runs (confirm's `run` step in packages/chat/src/engine.ts); the graph check (R8)
 * refuses any other importer.
 */
export async function traceStepOrFail(step: TraceStep): Promise<void> {
  const trace = currentTrace();
  if (trace) await withTenant(getRuntime().db, trace.tenantId, (tx) => appendTrace(tx, trace, step));
}

export async function verifyTraceChain(tx: Tx, tenantId: string, key?: string): Promise<ChainResult> {
  const rows = await tx.execute(sql`select * from core.trace_event where tenant_id = ${tenantId} order by seq`);
  return walkChain(rows, TRACE_SPEC, key);
}
