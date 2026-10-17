import { Client, Connection } from "@temporalio/client";
import { sql } from "drizzle-orm";
import { withTenant, type Db, type Tx } from "@amax/db";
import { controlRun, type ControlHook } from "../control";
import type { StartOptions, WorkflowEngine } from "../engine";
import { insertRun, validInput } from "../pg/engine";
import type { WorkflowRegistry } from "../registry";
import type { History } from "../replay";
import { fireSchedules, syncSchedules } from "../schedules";
import type { Json } from "../types";
import type { RunArgs } from "./activities";

export type TemporalEngineOptions = { db: Db; registry: WorkflowRegistry; address: string; namespace: string; taskQueue: string; apiKey?: string; tls?: boolean; client?: Client };

export const workflowIdOf = (runId: string) => `amax-${runId}`;

// Rebuilds the history from the mirror, so a retried run starts a fresh execution that skips every
// step, timer and event it had already completed.
async function mirroredHistory(tx: Tx, runId: string): Promise<History> {
  const rows = await tx.execute(sql`select name, kind, result from workflows.step where run_id = ${runId} and status = 'done'`);
  const h: History = { steps: {}, timers: {}, events: {} };
  for (const r of rows) {
    if (r.kind === "step") h.steps[r.name as string] = { status: "done", result: r.result as Json };
    if (r.kind === "sleep") h.timers[r.name as string] = true;
    if (r.kind === "wait") h.events[r.name as string] = { payload: r.result as Json };
  }
  return h;
}

export function createTemporalEngine(o: TemporalEngineOptions): WorkflowEngine {
  const { db, registry } = o;
  let client: Promise<Client> | undefined = o.client && Promise.resolve(o.client);
  const temporal = () => (client ??= Connection.connect({ address: o.address, tls: o.tls || undefined, apiKey: o.apiKey }).then((connection) => new Client({ connection, namespace: o.namespace })));
  const handle = async (runId: string) => (await temporal()).workflow.getHandle(workflowIdOf(runId));

  const launch = async (args: RunArgs) => void (await (await temporal()).workflow.start("amaxRun", { taskQueue: o.taskQueue, workflowId: workflowIdOf(args.runId), args: [args] }));

  const hook: ControlHook = async (tx, run, action) => {
    if (action === "pause" || action === "resume") await (await handle(run.id)).signal("amax.pause", action === "pause");
    if (action === "resume") {
      await tx.execute(sql`update workflows.run set status = coalesce((select case when bool_or(status = 'waiting') then 'waiting' when bool_or(status = 'sleeping') then 'sleeping' end
        from workflows.step where run_id = ${run.id} and status in ('waiting', 'sleeping')), 'running') where id = ${run.id}`);
    }
    if (action === "cancel") await (await handle(run.id)).cancel();
    if (action === "retry") {
      const [r] = await tx.execute(sql`select tenant_id, input, acts_for from workflows.run where id = ${run.id}`);
      await launch({ runId: run.id, tenantId: r.tenant_id as string, workflow: run.workflow, input: r.input as Json, actsFor: (r.acts_for as string | null) ?? null, history: await mirroredHistory(tx, run.id) });
    }
  };

  const engine: WorkflowEngine = {
    kind: "temporal",
    async start(tenantId, workflow, input, opts: StartOptions) {
      const clean = validInput(registry, workflow, input);
      const go = async (tx: Tx) => {
        const run = await insertRun(tx, "temporal", tenantId, workflow, clean, opts);
        if (run.created) await launch({ runId: run.id, tenantId, workflow, input: clean, actsFor: opts.actsFor ?? null });
        return run.id;
      };
      return opts.tx ? go(opts.tx) : withTenant(db, tenantId, go);
    },
    // Sent to every active run that is waiting for this event or declares it in waitsFor (so an
    // event that arrives before the run reaches its wait is still buffered in the workflow).
    async signal(tenantId, event, payload, tx) {
      const listeners = [...registry.workflows.values()].filter((w) => w.waitsFor?.includes(event)).map((w) => w.name);
      const find = (t: Tx) => t.execute(sql`select r.id from workflows.run r where r.engine = 'temporal' and r.status in ('running', 'sleeping', 'waiting', 'paused')
        and (r.workflow in (select jsonb_array_elements_text(${JSON.stringify(listeners)}::jsonb))
             or exists (select 1 from workflows.step s where s.run_id = r.id and s.status = 'waiting' and s.wait_event = ${event} and ${JSON.stringify(payload)}::jsonb @> s.wait_match))`);
      const runs = tx ? await find(tx) : await withTenant(db, tenantId, find);
      for (const r of runs) await (await handle(r.id as string)).signal("amax.event", { event, payload });
      return runs.length;
    },
    async tick() {
      await syncSchedules(db, registry);
      return { runs: 0, runsFailed: 0, schedulesFired: await fireSchedules(db, registry, engine.start, { leaseSeconds: 60, batch: 20 }) };
    },
    control: (admin, runId, action) => controlRun(db, admin, runId, action, hook),
  };
  return engine;
}
