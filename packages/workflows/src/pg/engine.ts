import { sql } from "drizzle-orm";
import { withTenant, type Db, type Tx } from "@amax/db";
import { controlRun } from "../control";
import type { StartOptions, WorkflowEngine, WorkflowTickResult } from "../engine";
import { errorText } from "../errors";
import { workflowOf, type WorkflowRegistry } from "../registry";
import { fireSchedules, syncSchedules } from "../schedules";
import type { Json } from "../types";
import { driveRun } from "./drive";
import { signalTx } from "./signal";
import { fenced, release } from "./store";

export type PostgresEngineOptions = { db: Db; registry: WorkflowRegistry; leaseSeconds?: number; batch?: number; budgetMs?: number; log?: (msg: string) => void };

// Inserts the run (or returns the one already started under the same key).
export async function insertRun(tx: Tx, registry: WorkflowRegistry, engine: "postgres" | "temporal", tenantId: string, workflow: string, input: Json, o: StartOptions) {
  const version = workflowOf(registry, workflow).version ?? 1;
  const [row] = await tx.execute(sql`insert into workflows.run (tenant_id, workflow, version, engine, key, input, acts_for, started_by, schedule_id, legal_entity_id, wake_at)
    values (${tenantId}, ${workflow}, ${version}, ${engine}, ${o.key ?? null}, ${JSON.stringify(input)}::jsonb, ${o.actsFor ?? null}, ${o.startedBy}, ${o.scheduleId ?? null}, ${o.legalEntityId ?? null}, now())
    on conflict (tenant_id, workflow, key) do update set updated_at = workflows.run.updated_at
    returning id, (xmax = 0) as created`);
  return { id: row.id as string, created: Boolean(row.created) };
}

export function validInput(registry: WorkflowRegistry, workflow: string, input: Json): Json {
  const def = workflowOf(registry, workflow);
  return def.input ? JSON.parse(JSON.stringify(def.input.parse(input))) : input;
}

export const inTx = <T>(db: Db, tenantId: string, tx: Tx | undefined, fn: (tx: Tx) => Promise<T>) => (tx ? fn(tx) : withTenant(db, tenantId, fn));

// Schedules first, but a failure there never stops due runs from being driven; it is reported.
export async function scheduleTick(db: Db, registry: WorkflowRegistry, start: WorkflowEngine["start"], log?: (msg: string) => void): Promise<{ schedulesFired: number; schedulesError?: string }> {
  try {
    await syncSchedules(db, registry);
    return { schedulesFired: await fireSchedules(db, registry, start, { leaseSeconds: 60, batch: 20, log }) };
  } catch (e) {
    log?.(`workflows: schedules failed: ${errorText(e)}`);
    return { schedulesFired: 0, schedulesError: errorText(e) };
  }
}

export function createPostgresEngine(o: PostgresEngineOptions): WorkflowEngine {
  const { db, registry } = o;
  const leaseSeconds = o.leaseSeconds ?? 300;
  const engine: WorkflowEngine = {
    kind: "postgres",
    async start(tenantId, workflow, input, opts) {
      const clean = validInput(registry, workflow, input);
      return (await inTx(db, tenantId, opts.tx, (tx) => insertRun(tx, registry, "postgres", tenantId, workflow, clean, opts))).id;
    },
    signal: (tenantId, event, payload, so = {}) => inTx(db, tenantId, so.tx, (t) => signalTx(t, tenantId, event, payload, so.id)),
    async tick(): Promise<WorkflowTickResult> {
      const deadline = Date.now() + (o.budgetMs ?? 20_000);
      const schedules = await scheduleTick(db, registry, engine.start, o.log);
      const claimed = await db.execute(sql`select * from workflows.claim_runs(${leaseSeconds}, ${o.batch ?? 20})`);
      const result: WorkflowTickResult = { runs: 0, runsFailed: 0, ...schedules };
      for (const c of claimed) {
        const run = { id: c.id as string, tenantId: c.tenant_id as string, lease: c.lease as string };
        try {
          if (Date.now() > deadline) await withTenant(db, run.tenantId, (tx) => fenced(tx, run, release));
          else {
            await driveRun(db, registry, run, { leaseSeconds, deadline, maxCommands: 100 });
            result.runs++;
          }
        } catch (e) {
          result.runsFailed++;
          o.log?.(`workflows: run ${run.id} errored: ${errorText(e)}`);
        }
      }
      return result;
    },
    control: (ctx, runId, action) => controlRun(ctx, runId, action, async () => {}),
  };
  return engine;
}
