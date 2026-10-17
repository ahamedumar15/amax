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

export type PostgresEngineOptions = { db: Db; registry: WorkflowRegistry; leaseSeconds?: number; batch?: number; budgetMs?: number; log?: (msg: string) => void };

// Inserts the run (or returns the one already started under the same key).
export async function insertRun(tx: Tx, engine: "postgres" | "temporal", tenantId: string, workflow: string, input: Json, o: StartOptions) {
  const [row] = await tx.execute(sql`insert into workflows.run (tenant_id, workflow, engine, key, input, acts_for, started_by, schedule_id, wake_at)
    values (${tenantId}, ${workflow}, ${engine}, ${o.key ?? null}, ${JSON.stringify(input)}::jsonb, ${o.actsFor ?? null}, ${o.startedBy}, ${o.scheduleId ?? null}, now())
    on conflict (tenant_id, workflow, key) do update set updated_at = workflows.run.updated_at
    returning id, (xmax = 0) as created`);
  return { id: row.id as string, created: Boolean(row.created) };
}

export function validInput(registry: WorkflowRegistry, workflow: string, input: Json): Json {
  const def = workflowOf(registry, workflow);
  return def.input ? JSON.parse(JSON.stringify(def.input.parse(input))) : input;
}

export function createPostgresEngine(o: PostgresEngineOptions): WorkflowEngine {
  const { db, registry } = o;
  const leaseSeconds = o.leaseSeconds ?? 300;
  const inTx = <T>(tenantId: string, tx: Tx | undefined, fn: (tx: Tx) => Promise<T>) => (tx ? fn(tx) : withTenant(db, tenantId, fn));
  const engine: WorkflowEngine = {
    kind: "postgres",
    async start(tenantId, workflow, input, opts) {
      const clean = validInput(registry, workflow, input);
      return (await inTx(tenantId, opts.tx, (tx) => insertRun(tx, "postgres", tenantId, workflow, clean, opts))).id;
    },
    signal: (tenantId, event, payload, tx) => inTx(tenantId, tx, (t) => signalTx(t, tenantId, event, payload)),
    async tick(): Promise<WorkflowTickResult> {
      const deadline = Date.now() + (o.budgetMs ?? 20_000);
      await syncSchedules(db, registry);
      const schedulesFired = await fireSchedules(db, registry, engine.start, { leaseSeconds: 60, batch: o.batch ?? 20 });
      const claimed = await db.execute(sql`select * from workflows.claim_runs(${leaseSeconds}, ${o.batch ?? 20})`);
      const result = { runs: 0, runsFailed: 0, schedulesFired };
      for (const c of claimed) {
        const run = { id: c.id as string, tenantId: c.tenant_id as string, lease: c.lease as string };
        try {
          await driveRun(db, registry, run, { leaseSeconds, deadline, maxCommands: 100 });
          result.runs++;
        } catch (e) {
          result.runsFailed++;
          o.log?.(`workflows: run ${run.id} errored: ${errorText(e)}`);
        }
      }
      return result;
    },
    control: (admin, runId, action) => controlRun(db, admin, runId, action, async () => {}),
  };
  return engine;
}
