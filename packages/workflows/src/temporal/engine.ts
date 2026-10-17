import { Client, Connection, WorkflowExecutionAlreadyStartedError, WorkflowNotFoundError } from "@temporalio/client";
import { sql } from "drizzle-orm";
import { withTenant, type Db, type Tx } from "@amax/db";
import { controlRun, type ControlHook } from "../control";
import type { RunAction, WorkflowEngine } from "../engine";
import { errorText } from "../errors";
import { inTx, insertRun, scheduleTick, validInput } from "../pg/engine";
import { lockEvent } from "../pg/signal";
import type { WorkflowRegistry } from "../registry";
import type { History } from "../replay";
import type { Json } from "../types";
import type { EventMessage, RunArgs } from "./activities";

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

/** Memoises the connection, but never a failed one: the next call connects again. */
export function connector(connect: () => Promise<Client>) {
  let client: Promise<Client> | undefined;
  return () => (client ??= connect().catch((e) => {
    client = undefined;
    throw e;
  }));
}

export function createTemporalEngine(o: TemporalEngineOptions): WorkflowEngine {
  const { db, registry } = o;
  const temporal = connector(async () => o.client ?? new Client({ connection: await Connection.connect({ address: o.address, tls: o.tls || undefined, apiKey: o.apiKey }), namespace: o.namespace }));
  const handle = async (runId: string) => (await temporal()).workflow.getHandle(workflowIdOf(runId));
  const listenersOf = (event: string) => [...registry.workflows.values()].filter((w) => w.waitsFor?.includes(event)).map((w) => w.name);

  // Starts the execution for a committed run, with its mirrored history (a retry) and every event
  // that arrived before now. The event locks make a concurrent signal either land in that buffer
  // or see launched_at and be sent live; the workflow drops the duplicate id if both happen.
  async function launch(tenantId: string, runId: string) {
    await withTenant(db, tenantId, async (tx) => {
      const [r] = await tx.execute(sql`select workflow, version, input, acts_for, legal_entity_id, launched_at, created_at from workflows.run where id = ${runId} for update`);
      if (!r || r.launched_at) return;
      const events = [...(registry.workflows.get(r.workflow as string)?.waitsFor ?? [])].sort();
      for (const e of events) await lockEvent(tx, tenantId, e);
      const buffered = await tx.execute(sql`select coalesce(source_id, id::text) as id, event, payload from workflows.signal
        where event in (select jsonb_array_elements_text(${JSON.stringify(events)}::jsonb)) and created_at >= ${r.created_at as string} order by created_at`);
      const args: RunArgs = {
        runId, tenantId, workflow: r.workflow as string, version: Number(r.version), input: r.input as Json,
        actsFor: (r.acts_for as string | null) ?? null, legalEntityId: (r.legal_entity_id as string | null) ?? null,
        history: await mirroredHistory(tx, runId), signals: buffered.map((b) => ({ id: b.id as string, event: b.event as string, payload: b.payload as Json })),
      };
      try {
        await (await temporal()).workflow.start("amaxRun", { taskQueue: o.taskQueue, workflowId: workflowIdOf(runId), args: [args] });
      } catch (e) {
        if (!(e instanceof WorkflowExecutionAlreadyStartedError)) throw e;
      }
      await tx.execute(sql`update workflows.run set launched_at = now() where id = ${runId}`);
    });
  }

  // Applies a committed pause, resume or cancel on Temporal, then clears it as pending.
  async function apply(tenantId: string, runId: string, action: RunAction) {
    const h = await handle(runId);
    if (action === "pause" || action === "resume") await h.signal("amax.pause", action === "pause");
    if (action === "cancel") await h.cancel().catch((e) => { if (!(e instanceof WorkflowNotFoundError)) throw e; });
    await withTenant(db, tenantId, async (tx) => {
      await tx.execute(sql`update workflows.run set engine_action = null where id = ${runId} and engine_action = ${action}`);
      if (action === "resume") {
        await tx.execute(sql`update workflows.run set status = coalesce((select case when bool_or(status = 'waiting') then 'waiting' when bool_or(status = 'sleeping') then 'sleeping' end
          from workflows.step where run_id = ${runId} and status in ('waiting', 'sleeping')), 'running') where id = ${runId} and status = 'running'`);
      }
    });
  }

  const later = (what: string) => (e: unknown) => o.log?.(`workflows: ${what} failed, the tick retries: ${errorText(e)}`);
  const hook: ControlHook = async (run, action) => {
    if (action === "retry") await launch(run.tenantId, run.id).catch(later(`relaunching ${run.id}`));
    else await apply(run.tenantId, run.id, action).catch(later(`${action} of ${run.id}`));
  };

  const engine: WorkflowEngine = {
    kind: "temporal",
    // Inside a caller's transaction the run is launched by the next tick, after that commit; on its
    // own it is launched as soon as the row is committed.
    async start(tenantId, workflow, input, opts) {
      const clean = validInput(registry, workflow, input);
      const run = await inTx(db, tenantId, opts.tx, (tx) => insertRun(tx, registry, "temporal", tenantId, workflow, clean, opts));
      if (run.created && !opts.tx) await launch(tenantId, run.id).catch(later(`launching ${run.id}`));
      return run.id;
    },
    // Buffered like on Postgres (a run not started yet gets it at launch) and sent to every started,
    // active run of a workflow that lists the event in waitsFor. A repeated id does nothing.
    signal: (tenantId, event, payload, so = {}) => inTx(db, tenantId, so.tx, async (tx) => {
      await lockEvent(tx, tenantId, event);
      const [sig] = await tx.execute(sql`insert into workflows.signal (tenant_id, event, payload, source_id) values (${tenantId}, ${event}, ${JSON.stringify(payload)}::jsonb, ${so.id ?? null})
        on conflict (tenant_id, source_id) do nothing returning id`);
      if (!sig) return 0;
      const message: EventMessage = { event, payload, id: so.id ?? (sig.id as string) };
      const runs = await tx.execute(sql`select id from workflows.run where engine = 'temporal' and launched_at is not null
        and status in ('running', 'sleeping', 'waiting', 'paused') and workflow in (select jsonb_array_elements_text(${JSON.stringify(listenersOf(event))}::jsonb))`);
      for (const r of runs) await (await handle(r.id as string)).signal("amax.event", message);
      return runs.length;
    }),
    async tick() {
      const schedules = await scheduleTick(db, registry, engine.start, o.log);
      const claimed = await db.execute(sql`select * from workflows.claim_temporal(60, 50)`);
      let runs = 0, runsFailed = 0;
      for (const c of claimed) {
        const tenantId = c.tenant_id as string, runId = c.id as string;
        try {
          const [r] = await withTenant(db, tenantId, (tx) => tx.execute(sql`select launched_at, engine_action from workflows.run where id = ${runId}`));
          if (!r.launched_at) await launch(tenantId, runId);
          else if (r.engine_action) await apply(tenantId, runId, r.engine_action as RunAction);
          runs++;
        } catch (e) {
          runsFailed++;
          later(`engine work for ${runId}`)(e);
        } finally {
          await withTenant(db, tenantId, (tx) => tx.execute(sql`update workflows.run set lease = null, locked_until = null where id = ${runId} and lease = ${c.lease as string}`));
        }
      }
      return { runs, runsFailed, ...schedules };
    },
    control: (ctx, runId, action) => controlRun(ctx, runId, action, hook),
  };
  return engine;
}
