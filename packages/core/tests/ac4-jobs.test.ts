import { sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { withTenant, type Db } from "@amax/db";
import { hasDb, migratedDatabase } from "@amax/db/testdb";
import { nextRun, registryFrom, runDueJobs, scheduleJob, type JobRegistry } from "../src/server";

const A = "00000000-0000-4000-8000-0000000000a4";
const B = "00000000-0000-4000-8000-0000000000b4";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe("AC-4 schedules", () => {
  it("computes the next cron run in UTC", () => {
    expect(nextRun("0 2 * * *", new Date("2026-10-16T13:00:00Z")).toISOString()).toBe("2026-10-17T02:00:00.000Z");
  });
  it("rejects a job declared twice", () => {
    const run = async () => {};
    expect(() => registryFrom([{ id: "a", jobs: [{ name: "x", run }] }, { id: "b", jobs: [{ name: "x", run }] }])).toThrow(/twice/);
  });
});

describe.skipIf(!hasDb)("AC-4 runDueJobs (Postgres)", () => {
  let t: Awaited<ReturnType<typeof migratedDatabase>>;
  let app: Db;
  const runs: { name: string; tenant: string; payload: unknown; visible: number }[] = [];
  let effects = 0;

  const registry: JobRegistry = registryFrom([{
    id: "sample",
    jobs: [
      // Records how many legal entities it can see: proves it runs under the job's own tenant.
      { name: "sample.count", run: async ({ tx, tenantId, payload }) => {
        const rows = await tx.execute(sql`select id from core.legal_entity`);
        await sleep(50);
        runs.push({ name: "sample.count", tenant: tenantId, payload, visible: rows.length });
      } },
      { name: "sample.fails", run: async () => { throw new Error("upstream down"); } },
      { name: "sample.nightly", cron: "0 2 * * *", run: async () => {} },
    ],
    events: { handles: [{ id: "sample.on-renamed", event: "core.legal_entity.renamed", handle: async ({ tx, tenantId }) => {
      effects++;
      await tx.execute(sql`insert into core.legal_entity (tenant_id, name, country, base_currency) values (${tenantId}, 'from event', 'AU', 'AUD')`);
    } }] },
  }]);

  beforeAll(async () => {
    t = await migratedDatabase();
    await t.owner`insert into core.tenant (id, name) values (${A}, 'A'), (${B}, 'B')`;
    await t.owner`insert into core.legal_entity (tenant_id, name, country, base_currency) values (${A}, 'a1', 'LK', 'LKR'), (${A}, 'a2', 'LK', 'LKR'), (${B}, 'b1', 'AU', 'AUD')`;
    app = t.app();
  });
  afterAll(() => t?.drop());
  beforeEach(() => { runs.length = 0; });

  it("runs each due job once under its own tenant, even when ticks overlap", async () => {
    for (const tenant of [A, B]) {
      for (let i = 0; i < 5; i++) await withTenant(app, tenant, (tx) => scheduleJob(tx, { tenantId: tenant, name: "sample.count", payload: { i } }));
    }
    const ticks = await Promise.all([runDueJobs(app, registry), runDueJobs(app, registry), runDueJobs(app, registry)]);
    expect(ticks.reduce((n, r) => n + r.jobs, 0)).toBe(10);
    expect(runs).toHaveLength(10);
    expect(new Set(runs.map((r) => `${r.tenant}:${JSON.stringify(r.payload)}`)).size).toBe(10);
    expect(runs.filter((r) => r.tenant === A).every((r) => r.visible === 2)).toBe(true);
    expect(runs.filter((r) => r.tenant === B).every((r) => r.visible === 1)).toBe(true);
    expect((await runDueJobs(app, registry)).jobs).toBe(0);
  });

  it("keyed jobs are deduplicated", async () => {
    for (let i = 0; i < 3; i++) await withTenant(app, A, (tx) => scheduleJob(tx, { tenantId: A, name: "sample.count", key: "once" }));
    expect((await runDueJobs(app, registry)).jobs).toBe(1);
  });

  it("a failing job is retried later with backoff and its error recorded", async () => {
    await withTenant(app, A, (tx) => scheduleJob(tx, { tenantId: A, name: "sample.fails" }));
    expect((await runDueJobs(app, registry)).jobsFailed).toBe(1);
    const [job] = await t.owner`select status, attempts, last_error, run_at > now() as later from core.job where name = 'sample.fails'`;
    expect(job).toMatchObject({ status: "pending", attempts: 1, last_error: "upstream down", later: true });
    expect((await runDueJobs(app, registry)).jobsFailed).toBe(0);
  });

  it("creates one cron row per tenant and reschedules it after a run", async () => {
    await runDueJobs(app, registry);
    await runDueJobs(app, registry);
    const rows = await t.owner`select tenant_id, run_at from core.job where name = 'sample.nightly' order by tenant_id`;
    expect(rows.map((r) => r.tenant_id)).toEqual([A, B]);
    await t.owner`update core.job set run_at = now() - interval '1 minute' where name = 'sample.nightly'`;
    expect((await runDueJobs(app, registry)).jobs).toBe(2);
    const [after] = await t.owner`select status, run_at > now() as later from core.job where name = 'sample.nightly' limit 1`;
    expect(after).toEqual({ status: "pending", later: true });
  });

  it("delivers each event to its handlers, and a second delivery changes nothing", async () => {
    for (const tenant of [A, B]) {
      await withTenant(app, tenant, (tx) => tx.execute(sql`insert into core.event (tenant_id, name, payload) values (${tenant}, 'core.legal_entity.renamed', '{}'), (${tenant}, 'nobody.listens', '{}')`));
    }
    expect((await runDueJobs(app, registry)).events).toBe(4);
    expect(effects).toBe(2);
    // Simulate at-least-once redelivery of every event (e.g. a crash after the handler, before marking).
    await t.owner`update core.event set delivered_at = null, locked_until = null`;
    expect((await runDueJobs(app, registry)).events).toBe(4);
    expect(effects).toBe(2);
    const [{ n }] = await t.owner`select count(*)::int as n from core.legal_entity where name = 'from event'`;
    expect(n).toBe(2);
  });

  it("outside the claim functions the app role still sees only its own tenant's jobs", async () => {
    const leaked = await withTenant(app, A, (tx) => tx.execute(sql`select * from core.job where tenant_id = ${B}`));
    expect(leaked.length).toBe(0);
  });
});
