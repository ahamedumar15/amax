import { ApplicationFailure, Context } from "@temporalio/activity";
import { sql } from "drizzle-orm";
import { withTenant, type Db } from "@amax/db";
import { workflowOf, type WorkflowRegistry } from "../registry";
import { writeStep, nextSeqOf } from "../pg/store";
import { advance, type Advance, type History } from "../replay";
import type { Json } from "../types";

export type RunArgs = { runId: string; tenantId: string; workflow: string; input: Json; actsFor: string | null; history?: History };
export type StepMark = { name: string; kind: "sleep" | "wait"; status: "sleeping" | "waiting" | "done"; fireInMs?: number | null; waitEvent?: string; waitMatch?: Json; result?: Json };
export type Mark = { status: "running" | "sleeping" | "waiting" | "completed" | "failed"; output?: Json; error?: string; step?: StepMark };

const info = (a: RunArgs) => ({ tenantId: a.tenantId, runId: a.runId, actsFor: a.actsFor, input: a.input });
const json = (v: unknown) => (v === undefined ? null : JSON.stringify(v));

// Activities the generic workflow calls. They replay the definition (plan, runStep) and mirror the
// run into the workflows tables (mark), so the Runs list and admin actions work the same on both engines.
export function createActivities(db: Db, registry: WorkflowRegistry) {
  return {
    async plan(args: RunArgs, history: History): Promise<Advance> {
      return advance(workflowOf(registry, args.workflow), info(args), history);
    },

    async runStep(args: RunArgs, history: History, name: string): Promise<Json> {
      const attempt = Context.current().info.attempt;
      const r = await advance(workflowOf(registry, args.workflow), info(args), history, { attempt: () => attempt });
      if (r.kind !== "executed" || r.name !== name) throw ApplicationFailure.nonRetryable(`workflow ${args.workflow} no longer reaches step "${name}"`, "AmaxNondeterminism");
      const o = r.outcome;
      const last = !o.ok && (!o.retryable || attempt >= r.options.maxAttempts);
      const status = o.ok ? "done" : last ? "failed" : "retrying";
      await withTenant(db, args.tenantId, async (tx) => {
        await tx.execute(sql`update workflows.run set cost_usd = cost_usd + ${o.costUsd}, updated_at = now() where id = ${args.runId}`);
        await writeStep(tx, { runId: args.runId, tenantId: args.tenantId, name, seq: nextSeqOf(args.runId), attempt, status, outcome: o, options: r.options });
      });
      if (o.ok) return o.result;
      throw last ? ApplicationFailure.nonRetryable(o.error, "AmaxStepFailed") : ApplicationFailure.retryable(o.error, "AmaxStepRetry");
    },

    async mark(args: RunArgs, m: Mark): Promise<void> {
      const finished = m.status === "completed" || m.status === "failed";
      await withTenant(db, args.tenantId, async (tx) => {
        await tx.execute(sql`update workflows.run set status = ${m.status}, output = coalesce(${json(m.output)}::jsonb, output), error = coalesce(${m.error ?? null}, error),
            finished_at = ${finished ? sql`now()` : null}, updated_at = now()
          where id = ${args.runId} and status not in ('paused', 'cancelled', 'completed', 'failed')`);
        if (!m.step) return;
        const s = m.step;
        const fireAt = s.fireInMs === undefined || s.fireInMs === null ? null : sql`now() + make_interval(secs => ${s.fireInMs / 1000})`;
        await tx.execute(sql`insert into workflows.step (run_id, tenant_id, name, seq, kind, status, fire_at, wait_event, wait_match, result, finished_at)
          values (${args.runId}, ${args.tenantId}, ${s.name}, ${nextSeqOf(args.runId)}, ${s.kind}, ${s.status}, ${fireAt},
                  ${s.waitEvent ?? null}, ${json(s.waitMatch)}::jsonb, ${json(s.result)}::jsonb, ${s.status === "done" ? sql`now()` : null})
          on conflict (run_id, name) do update set status = excluded.status, result = excluded.result, finished_at = excluded.finished_at
          where workflows.step.status <> 'done'`);
      });
    },
  };
}

export type Activities = ReturnType<typeof createActivities>;
