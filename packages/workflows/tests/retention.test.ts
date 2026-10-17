import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { withTenant } from "@amax/db";
import { hasDb } from "@amax/db/testdb";
import { pruneRunsJob, workflowsRetention } from "../src/server";
import { pgHarness, settle, TENANT, type Harness } from "./harness";

describe.skipIf(!hasDb)("AC-5 retention (032)", () => {
  let h: Harness;
  beforeAll(async () => void (h = await pgHarness()), 60_000);
  afterAll(async () => void (await h?.close()));

  it("keeps a live run's checkpoints however old, and deletes finished, idle and old records", async () => {
    const live = await h.engine.start(TENANT, "test.early", { id: "live" }, { startedBy: "test" });
    const finished = await h.engine.start(TENANT, "test.counter", null, { startedBy: "test" });
    const idle = await h.engine.start(TENANT, "test.early", { id: "idle" }, { startedBy: "test" });
    await settle(h, live, ["waiting"]);
    await settle(h, idle, ["waiting"]);
    await settle(h, finished, ["completed"]);
    expect((await h.t.owner`select count(*)::int as n from workflows.step where run_id = ${finished} and run_finished_at is not null`)[0].n).toBe(2);
    await h.t.owner`update workflows.step set finished_at = now() - interval '2 years'`;
    await h.t.owner`update workflows.run set finished_at = now() - interval '2 years' where id = ${finished}`;
    await h.t.owner`update workflows.run set updated_at = now() - interval '3 years' where id = ${idle}`;
    await h.engine.signal(TENANT, "test.go", { id: "nobody" });
    await h.t.owner`update workflows.signal set created_at = now() - interval '40 days'`;
    await withTenant(h.db, TENANT, (tx) => pruneRunsJob.run({ tx, tenantId: TENANT, payload: {}, jobId: "prune" }));
    expect((await h.t.owner`select id from workflows.run`).map((r) => r.id)).toEqual([live]);
    expect((await h.t.owner`select name from workflows.step where run_id = ${live}`).map((s) => s.name).sort()).toEqual(["go", "prep"]);
    expect((await h.t.owner`select count(*)::int as n from workflows.signal`)[0].n).toBe(0);
    expect(workflowsRetention.map((e) => [e.table, e.start.at[0]])).toEqual([["workflows.run", "finished_at"], ["workflows.step", "run_finished_at"], ["workflows.signal", "created_at"]]);
  }, 60_000);
});
