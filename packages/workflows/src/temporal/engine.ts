import { Client, Connection, WorkflowExecutionAlreadyStartedError } from "@temporalio/client";
import { sql } from "drizzle-orm";
import { withTenant, type Db, type Tx } from "@amax/db";
import { controlRun, type ControlHook } from "../control";
import type { WorkflowEngine } from "../engine";
import { errorText } from "../errors";
import { inTx, insertRun, scheduleTick, validInput } from "../pg/engine";
import type { WorkflowRegistry } from "../registry";
import type { History } from "../replay";
import type { Json } from "../types";

export type TemporalEngineOptions = { db: Db; registry: WorkflowRegistry; address: string; namespace: string; taskQueue: string; apiKey?: string; tls?: boolean; client?: Client; log?: (msg: string) => void };

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

// Memoises the connection, but never a failed one: the next call reconnects.
function connector(o: TemporalEngineOptions) {
  let client: Promise<Client> | undefined = o.client && Promise.resolve(o.client);
  return () => (client ??= Connection.connect({ address: o.address, tls: o.tls || undefined, apiKey: o.apiKey })
    .then((connection) => new Client({ connection, namespace: o.namespace }))
    .catch((e) => {
      client = undefined;
      throw e;
    }));
}

export function createTemporalEngine(o: TemporalEngineOptions): WorkflowEngine {
  const { db, registry } = o;
  const temporal = connector(o);
  const handle = async (runId: string) => (await temporal()).workflow.getHandle(workflowIdOf(runId));

  // Starts the Temporal execution for a committed run row (new, or retried with its mirrored history).
  async function launch(tenantId: string, runId: string) {
    const [r] = await withTenant(db, tenantId, (tx) => tx.execute(sql`select workflow, version, input, acts_for, legal_entity_id, launched_at from workflows.run where id = ${runId}`));
    if (!r || r.launched_at) return;
    const history = await withTenant(db, tenantId, (tx) => mirroredHistory(tx, runId));
    const args = { runId, tenantId, workflow: r.workflow as string, version: Number(r.version), input: r.input as Json, actsFor: (r.acts_for as string | null) ?? null, legalEntityId: (r.legal_entity_id as string | null) ?? null, history };
    try {
      await (await temporal()).workflow.start("amaxRun", { taskQueue: o.taskQueue, workflowId: workflowIdOf(runId), args: [args] });
    } catch (e) {
      if (!(e instanceof WorkflowExecutionAlreadyStartedError)) throw e;
    }
    await withTenant(db, tenantId, (tx) => tx.execute(sql`update workflows.run set launched_at = now(), lease = null, locked_until = null where id = ${runId}`));
  }
  const tryLaunch = (tenantId: string, runId: string) => launch(tenantId, runId).catch((e) => o.log?.(`workflows: launching ${runId} failed, the tick retries: ${errorText(e)}`));

  // Runs after the control has committed and been audited.
  const hook: ControlHook = async (run, action) => {
    if (action === "pause" || action === "resume") await (await handle(run.id)).signal("amax.pause", action === "pause");
    if (action === "resume") {
      await withTenant(db, run.tenantId, (tx) => tx.execute(sql`update workflows.run set status = coalesce((select case when bool_or(status = 'waiting') then 'waiting' when bool_or(status = 'sleeping') then 'sleeping' end
        from workflows.step where run_id = ${run.id} and status in ('waiting', 'sleeping')), 'running') where id = ${run.id} and status = 'running'`));
    }
    if (action === "cancel") await (await handle(run.id)).cancel();
    if (action === "retry") await tryLaunch(run.tenantId, run.id);
  };

  const engine: WorkflowEngine = {
    kind: "temporal",
    // Inside a caller's transaction the run is launched by the next tick, after that commit; on its
    // own it is launched as soon as the row is committed.
    async start(tenantId, workflow, input, opts) {
      const clean = validInput(registry, workflow, input);
      const run = await inTx(db, tenantId, opts.tx, (tx) => insertRun(tx, registry, "temporal", tenantId, workflow, clean, opts));
      if (run.created && !opts.tx) await tryLaunch(tenantId, run.id);
      return run.id;
    },
    // Delivered to every active run of a workflow that lists the event in waitsFor; the workflow
    // buffers it until its wait and ignores a repeated id.
    async signal(tenantId, event, payload, so = {}) {
      const listeners = JSON.stringify([...registry.workflows.values()].filter((w) => w.waitsFor?.includes(event)).map((w) => w.name));
      const runs = await inTx(db, tenantId, so.tx, (t) => t.execute(sql`select id from workflows.run where engine = 'temporal' and launched_at is not null
        and status in ('running', 'sleeping', 'waiting', 'paused') and workflow in (select jsonb_array_elements_text(${listeners}::jsonb))`));
      for (const r of runs) await (await handle(r.id as string)).signal("amax.event", { event, payload, id: so.id });
      return runs.length;
    },
    async tick() {
      const schedulesFired = await scheduleTick(db, registry, engine.start, o.log);
      const pending = await db.execute(sql`select * from workflows.claim_launches(60, 50)`);
      let runsFailed = 0;
      for (const p of pending) await launch(p.tenant_id as string, p.id as string).catch(() => void runsFailed++);
      return { runs: pending.length - runsFailed, runsFailed, schedulesFired };
    },
    control: (ctx, runId, action) => controlRun(ctx, runId, action, hook),
  };
  return engine;
}
