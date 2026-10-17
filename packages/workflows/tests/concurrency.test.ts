import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { setTenant } from "@amax/db";
import { hasDb } from "@amax/db/testdb";
import { cron } from "../src";
import { createPostgresEngine, workflowRegistry } from "../src/server";
import { count, testWorkflows } from "./fixtures/workflows";
import { pause, pgHarness, settle, TENANT, type Harness } from "./harness";

const slot = cron({ name: "test.slot", title: "Slot", workflow: "test.counter", cron: "0 6 * * *" });
const registry = workflowRegistry([{ id: "test", workflows: testWorkflows, schedules: [slot] }]);

describe.skipIf(!hasDb)("AC-2 concurrent workers", () => {
  let h: Harness;
  beforeAll(async () => void (h = await pgHarness()), 60_000);
  afterAll(async () => void (await h?.close()));

  it("two workers ticking at once run every step once and fire a schedule slot once", async () => {
    const one = createPostgresEngine({ db: h.t.app(), registry });
    const two = createPostgresEngine({ db: h.t.app(), registry });
    await one.tick();
    await h.t.owner`update workflows.schedule set next_run_at = now() - interval '1 minute'`;
    const ids = await Promise.all(Array.from({ length: 12 }, () => one.start(TENANT, "test.counter", null, { startedBy: "test" })));
    const open = async () => (await h.t.owner`select count(*)::int as n from workflows.run where status <> 'completed'`)[0].n as number;
    const loop = async (e: typeof one) => { for (let i = 0; i < 200 && (await open()) > 0; i++) await e.tick(); };
    await Promise.all([loop(one), loop(two), loop(one), loop(two)]);
    const all = (await h.t.owner`select id from workflows.run`).map((r) => r.id as string);
    expect(all).toHaveLength(13);
    expect(all.every((id) => count(`a:${id}`) === 1 && count(`b:${id}`) === 1)).toBe(true);
    expect(ids.every((id) => all.includes(id))).toBe(true);
  }, 90_000);

  it("an event signalled while a run is starting its wait is never lost", async () => {
    const id = await h.engine.start(TENANT, "test.approval", { id: "race" }, { startedBy: "test" });
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const signalling = h.db.transaction(async (tx) => {
      await setTenant(tx, TENANT);
      await h.engine.signal(TENANT, "agents.suggestion.decided", { id: "race", accepted: true }, { tx });
      await gate;
    });
    await pause(100);
    const ticking = createPostgresEngine({ db: h.t.app(), registry }).tick();
    await pause(300);
    release();
    await Promise.all([signalling, ticking]);
    expect((await settle(h, id, ["completed"], 5_000)).output).toEqual({ accepted: true });
  }, 30_000);
});
