import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { hasDb } from "@amax/db/testdb";
import { tablesMissingRls } from "@amax/testing";
import { getRun, listRuns } from "../src/server";
import { admin, pgHarness, pm, settle, TENANT, type Harness } from "./harness";

describe.skipIf(!hasDb)("AC-5 run records, masking and audited admin actions", () => {
  let h: Harness;
  beforeAll(async () => void (h = await pgHarness()), 60_000);
  afterAll(async () => void (await h?.close()));

  it("masks classified fields for viewers without the class, audits every action, refuses non-admins, and isolates tenants", async () => {
    const id = await h.engine.start(TENANT, "test.pipeline", { tag: "audit", salary: 12000 }, { startedBy: "test", actsFor: "user:maya" });
    await settle(h, id, ["completed"]);
    const masked = await getRun(h.db, h.registry, TENANT, id, (cls) => cls !== "pay");
    expect(masked).toMatchObject({ input: { tag: "audit", salary: { masked: true, class: "pay" } }, output: { total: 20, salary: { masked: true, class: "pay" } } });

    const waiting = await h.engine.start(TENANT, "test.approval", { id: "audit" }, { startedBy: "test" });
    await settle(h, waiting, ["waiting"]);
    await expect(h.engine.control(pm, waiting, "pause")).rejects.toThrow(/forbidden/);
    await expect(h.engine.control(admin, waiting, "retry")).rejects.toThrow(/can't retry a waiting run/);
    for (const action of ["pause", "resume", "cancel"] as const) await h.engine.control(admin, waiting, action);
    const audit = await h.t.owner`select action, actor, resource_id, before, after from core.audit_event where resource = 'workflows.run' order by seq`;
    expect(audit.map((a) => [a.action, a.actor, a.resource_id, a.before.status, a.after.status])).toEqual([
      ["workflows.run.pause", "user:u-admin", waiting, "waiting", "paused"],
      ["workflows.run.resume", "user:u-admin", waiting, "paused", "running"],
      ["workflows.run.cancel", "user:u-admin", waiting, "running", "cancelled"],
    ]);
    const events = await h.t.owner`select name, payload from core.event where name like 'workflows.run.%' order by created_at`;
    expect(events.map((e) => [e.name, e.payload.runId])).toEqual([["workflows.run.paused", waiting], ["workflows.run.resumed", waiting], ["workflows.run.cancelled", waiting]]);

    expect((await tablesMissingRls(h.t.owner)).filter((t) => t.startsWith("workflows."))).toEqual([]);
    expect(await listRuns(h.db, h.registry, "00000000-0000-4000-8000-00000000ffff", () => true)).toEqual([]);
  }, 60_000);
});
