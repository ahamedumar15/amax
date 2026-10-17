import { sql } from "drizzle-orm";
import type { Tx } from "@amax/db";
import type { StepOutcome } from "../execute";
import { emptyHistory, type History } from "../replay";
import type { Json, ResolvedStepOptions } from "../types";

export type ClaimedRun = { id: string; tenantId: string; lease: string };
export type LoadedRun = {
  workflow: string;
  input: Json;
  actsFor: string | null;
  createdAt: string;
  history: History;
  attempts: Record<string, number>;
  nextSeq: number;
};

// Renews the lease and reads the run, all under the fencing token: null means another worker owns
// the run now, or an admin paused or cancelled it, and this worker must stop.
export async function loadRun(tx: Tx, run: ClaimedRun, leaseSeconds: number): Promise<LoadedRun | null> {
  const [row] = await tx.execute(sql`update workflows.run set locked_until = now() + make_interval(secs => ${leaseSeconds}), updated_at = now()
    where id = ${run.id} and lease = ${run.lease} and status in ('running', 'sleeping', 'waiting')
    returning workflow, input, acts_for, created_at`);
  if (!row) return null;
  // Timers and event timeouts that have come due resolve now (an event timeout resolves to null).
  await tx.execute(sql`update workflows.step set status = 'done', result = 'null'::jsonb, finished_at = now()
    where run_id = ${run.id} and status in ('sleeping', 'waiting') and fire_at <= now()`);
  const steps = await tx.execute(sql`select name, kind, status, attempts, result, error, seq from workflows.step where run_id = ${run.id}`);
  const history = emptyHistory();
  const attempts: Record<string, number> = {};
  for (const s of steps) {
    const name = s.name as string;
    attempts[name] = Number(s.attempts);
    if (s.kind === "step" && s.status === "done") history.steps[name] = { status: "done", result: s.result as Json };
    if (s.kind === "step" && s.status === "failed") history.steps[name] = { status: "failed", error: s.error as string };
    if (s.kind === "sleep" && s.status === "done") history.timers[name] = true;
    if (s.kind === "wait" && s.status === "done") history.events[name] = { payload: s.result as Json };
  }
  return {
    workflow: row.workflow as string,
    input: row.input as Json,
    actsFor: (row.acts_for as string | null) ?? null,
    createdAt: new Date(row.created_at as string).toISOString(),
    history,
    attempts,
    nextSeq: steps.reduce((m, s) => Math.max(m, Number(s.seq)), 0) + 1,
  };
}

// Applies a run update only while this worker still holds the lease; false means it lost it.
export async function fenced(tx: Tx, run: ClaimedRun, set: ReturnType<typeof sql>) {
  const rows = await tx.execute(sql`update workflows.run set ${set}, updated_at = now() where id = ${run.id} and lease = ${run.lease} returning 1`);
  return rows.length > 0;
}

export const release = sql`locked_until = null, lease = null`;

export type StepWrite = { runId: string; tenantId: string; name: string; seq: ReturnType<typeof sql> | number; attempt: number; status: "done" | "retrying" | "failed"; outcome: StepOutcome; options: ResolvedStepOptions };

// Records one step attempt. A row that is already done is never overwritten, so a late duplicate
// delivery can't replace the checkpointed result.
export async function writeStep(tx: Tx, w: StepWrite) {
  const o = w.outcome;
  await tx.execute(sql`insert into workflows.step (run_id, tenant_id, name, seq, kind, status, attempts, result, error, tool_calls, cost_usd, sensitive, finished_at)
    values (${w.runId}, ${w.tenantId}, ${w.name}, ${w.seq}, 'step', ${w.status}, ${w.attempt}, ${o.ok ? JSON.stringify(o.result) : null}::jsonb,
            ${o.ok ? null : o.error}, ${JSON.stringify(o.toolCalls)}::jsonb, ${o.costUsd}, ${JSON.stringify(w.options.sensitive)}::jsonb, ${w.status === "retrying" ? null : sql`now()`})
    on conflict (run_id, name) do update set status = excluded.status, attempts = excluded.attempts, result = excluded.result, error = excluded.error,
      tool_calls = workflows.step.tool_calls || excluded.tool_calls, cost_usd = workflows.step.cost_usd + excluded.cost_usd, finished_at = excluded.finished_at
    where workflows.step.status in ('retrying', 'failed')`);
}

export const nextSeqOf = (runId: string) => sql`(select coalesce(max(seq), 0) + 1 from workflows.step where run_id = ${runId})`;
