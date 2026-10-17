import type { Db } from "@amax/db";
import { migratedDatabase } from "@amax/db/testdb";
import { createPostgresEngine, getRun, workflowRegistry, type RunView, type WorkflowEngine, type WorkflowRegistry } from "../src/server";
import type { RunStatus } from "../src/types";
import { testWorkflows } from "./fixtures/workflows";

export const TENANT = "00000000-0000-4000-8000-0000000002a9";
export const admin = { tenantId: TENANT, userId: "u-admin", roles: ["Admin"] };
export const seeAll = () => true;
export const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));

export type Harness = { name: string; engine: WorkflowEngine; db: Db; registry: WorkflowRegistry; t: Awaited<ReturnType<typeof migratedDatabase>>; close: () => Promise<void> };

export async function database() {
  const t = await migratedDatabase();
  await t.owner`insert into core.tenant (id, name) values (${TENANT}, 'Lumen Labs')`;
  return t;
}

export const testRegistry = (extra: { schedules?: unknown[] } = {}) => workflowRegistry([{ id: "test", workflows: testWorkflows, ...extra }]);

export async function pgHarness(): Promise<Harness> {
  const t = await database();
  const db = t.app();
  const registry = testRegistry();
  return { name: "postgres", engine: createPostgresEngine({ db, registry }), db, registry, t, close: () => t.drop() };
}

// Ticks (a no-op for runs on Temporal, whose worker drives them) until the run reaches a status.
export async function settle(h: Harness, runId: string, statuses: RunStatus[], timeoutMs = 20_000): Promise<RunView> {
  const until = Date.now() + timeoutMs;
  for (;;) {
    await h.engine.tick();
    const run = await getRun(h.db, h.registry, TENANT, runId, seeAll);
    if (run && statuses.includes(run.status)) return run;
    if (Date.now() > until) throw new Error(`run ${runId} is ${run?.status}, expected ${statuses.join("/")}: ${JSON.stringify(run)}`);
    await pause(50);
  }
}
