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

  it.each([2, 3])("a step longer than the %ss lease is heartbeated: a second worker never re-runs it", async (lease) => {
    const one = createPostgresEngine({ db: h.t.app(), registry, leaseSeconds: lease });
    const two = createPostgresEngine({ db: h.t.app(), registry, leaseSeconds: lease });
    const id = await one.start(TENANT, "test.slow", { ms: lease * 1000 + 2500 }, { startedBy: "test" });
    const done = async () => (await h.t.owner`select status from workflows.run where id = ${id}`)[0].status === "completed";
    const loop = async (e: typeof one) => { for (let i = 0; i < 400 && !(await done()); i++) { await e.tick(); await pause(100); } };
    await Promise.all([loop(one), loop(two)]);
    expect([count(`slow:${id}`), count(`aborted:${id}`), count(`after:${id}`)]).toEqual([1, 0, 1]);
  }, 60_000);

  it("a step whose lease is taken over is aborted and its outcome discarded", async () => {
    const one = createPostgresEngine({ db: h.t.app(), registry, leaseSeconds: 2 });
    const id = await one.start(TENANT, "test.slow", { ms: 4000 }, { startedBy: "test" });
    const ticking = one.tick();
    for (let i = 0; i < 100 && count(`slow:${id}`) === 0; i++) await pause(20);
    await h.t.owner`update workflows.run set lease = gen_random_uuid() where id = ${id}`;
    await ticking;
    expect(count(`aborted:${id}`)).toBe(1);
    expect((await h.t.owner`select status, attempts from workflows.step where run_id = ${id}`).map((s) => [s.status, s.attempts])).toEqual([["started", 1]]);
    await h.t.owner`update workflows.run set lease = null, locked_until = null where id = ${id}`;
    expect((await settle(h, id, ["completed"], 20_000)).steps.map((s) => [s.name, s.attempts])).toEqual([["slow", 2], ["after", 1]]);
  }, 60_000);

  it.each([[-1, 0], [50, 1]])("a tick past its %sms budget releases runs instead of driving them (%s steps done)", async (budgetMs, stepsDone) => {
    const late = createPostgresEngine({ db: h.t.app(), registry, budgetMs });
    const ids = await Promise.all([1, 2].map(() => late.start(TENANT, "test.slow", { ms: 100 }, { startedBy: "test" })));
    await late.tick();
    const rows = await h.t.owner`select r.id, r.status, r.lease, (select count(*)::int from workflows.step s where s.run_id = r.id and s.status = 'done') as done
      from workflows.run r where r.id in ${h.t.owner(ids)} order by r.id`;
    expect(rows.every((r) => r.status === "running" && r.lease === null)).toBe(true);
    expect(rows.map((r) => r.done).sort()).toEqual(budgetMs < 0 ? [0, 0] : [0, stepsDone]);
    for (const id of ids) await settle(h, id, ["completed"]);
  }, 60_000);

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
