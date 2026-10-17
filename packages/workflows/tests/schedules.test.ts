import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import type { Db } from "@amax/db";
import { hasDb } from "@amax/db/testdb";
import { cron } from "../src";
import { createPostgresEngine, listSchedules, setScheduleEnabled, type WorkflowEngine } from "../src/server";
import { admin, database, TENANT, testRegistry, useRuntime } from "./harness";

const LK = "00000000-0000-4000-8000-0000000003a1";
const AU = "00000000-0000-4000-8000-0000000003a2";
const NZ = "00000000-0000-4000-8000-0000000003a3";
const sweep = cron({ name: "test.sweep", title: "Unused licence sweep", workflow: "test.counter", cron: "0 6 * * *", timezone: "entity" });
const nightly = cron({ name: "test.nightly", title: "Nightly", workflow: "test.counter", cron: "30 1 * * *", enabled: false });
const broken = cron({ name: "test.broken", title: "Broken", workflow: "test.pipeline", cron: "0 * * * *", input: { wrong: true } });
const registry = testRegistry({ schedules: [sweep, nightly, broken] });

describe.skipIf(!hasDb)("AC-6 cron schedules per legal entity", () => {
  let t: Awaited<ReturnType<typeof database>>;
  let db: Db;
  let engine: WorkflowEngine;
  beforeAll(async () => {
    t = await database();
    await t.owner`insert into core.legal_entity (id, tenant_id, name, country, base_currency) values
      (${LK}, ${TENANT}, 'Lumen Labs Lanka', 'LK', 'LKR'), (${AU}, ${TENANT}, 'Lumen Labs Australia', 'AU', 'AUD'), (${NZ}, ${TENANT}, 'Lumen Labs NZ', 'NZ', 'NZD')`;
    await t.owner`insert into workflows.entity_zone (legal_entity_id, tenant_id, timezone) values (${AU}, ${TENANT}, 'Australia/Sydney')`;
    db = t.app();
    useRuntime(db);
    engine = createPostgresEngine({ db, registry });
  }, 60_000);
  afterAll(async () => void (await t?.drop()));

  it("fires each entity's 06:00 in its own zone, never guesses a zone, isolates a broken schedule, and a disabled one creates no runs", async () => {
    await engine.tick();
    const rows = await listSchedules(db, registry, TENANT);
    const by = (entity: string | null, name = "test.sweep") => rows.find((r) => r.entity === entity && r.name === name)!;
    expect(by("Lumen Labs Lanka").timezone).toBe("Asia/Colombo");
    expect(by("Lumen Labs Australia").timezone).toBe("Australia/Sydney");
    expect(by("Lumen Labs NZ")).toMatchObject({ timezone: null, nextRunAt: null });
    expect(new Date(by("Lumen Labs Lanka").nextRunAt!).toISOString()).toMatch(/T00:30:00/);
    expect(new Date(by("Lumen Labs Australia").nextRunAt!).getUTCHours()).toBeOneOf([19, 20]);
    expect(by(null, "test.nightly")).toMatchObject({ timezone: "UTC", enabled: false });

    await setScheduleEnabled(admin, by("Lumen Labs Australia").id, false);
    await t.owner`update workflows.schedule set next_run_at = now() - interval '1 minute' where timezone is not null`;
    await engine.tick();
    await engine.tick();
    const runs = await t.owner`select s.name, s.timezone, r.legal_entity_id, r.status from workflows.run r join workflows.schedule s on s.id = r.schedule_id`;
    expect(runs.map((r) => [r.name, r.timezone, r.legal_entity_id, r.status])).toEqual([["test.sweep", "Asia/Colombo", LK, "completed"]]);
    const after = await listSchedules(db, registry, TENANT);
    expect(after.find((r) => r.name === "test.broken")!.lastError).toMatch(/tag/);
    expect(after.find((r) => r.entity === "Lumen Labs Lanka")).toMatchObject({ enabled: true, lastStatus: "completed", lastSummary: "counted" });
    expect(after.find((r) => r.entity === "Lumen Labs Australia")).toMatchObject({ enabled: false, lastRunAt: null });

    const other = "00000000-0000-4000-8000-0000000003ff";
    await t.owner`insert into core.tenant (id, name) values (${other}, 'Other')`;
    for (const [tenant, entity, zone, error] of [[TENANT, NZ, "Mars/Olympus", /unknown time zone/], [other, NZ, "Pacific/Auckland", /not in this tenant/], [TENANT, NZ, "auckland", /unknown time zone/]] as const) {
      await expect(db.transaction(async (tx) => {
        await tx.execute(sql`select set_config('app.tenant_id', ${tenant}, true)`);
        await tx.execute(sql`insert into workflows.entity_zone (legal_entity_id, tenant_id, timezone) values (${entity}, ${tenant}, ${zone})`);
      })).rejects.toMatchObject({ cause: { message: expect.stringMatching(error) } });
    }
    await t.owner`insert into workflows.entity_zone (legal_entity_id, tenant_id, timezone) values (${NZ}, ${TENANT}, 'Pacific/Auckland')`;
    await engine.tick();
    expect((await listSchedules(db, registry, TENANT)).find((r) => r.entity === "Lumen Labs NZ")!.timezone).toBe("Pacific/Auckland");
    const [audit] = await t.owner`select action, actor, after from core.audit_event where resource = 'workflows.schedule'`;
    expect((await engine.tick()).schedulesError).toBeUndefined();
    expect(audit).toMatchObject({ action: "workflows.schedule.toggle", actor: "user:u-admin", after: { enabled: false, name: "test.sweep" } });
  }, 60_000);
});

describe.skipIf(!hasDb)("AC-6 a broken schedule never blocks the others", () => {
  let t: Awaited<ReturnType<typeof database>>;
  let engine: WorkflowEngine;
  beforeAll(async () => {
    t = await database();
    await t.owner`insert into core.legal_entity (id, tenant_id, name, country, base_currency) values (${LK}, ${TENANT}, 'Lanka', 'LK', 'LKR'), (${NZ}, ${TENANT}, 'NZ', 'NZ', 'NZD')`;
    const db = t.app();
    useRuntime(db);
    engine = createPostgresEngine({ db, registry: testRegistry({ schedules: [sweep, cron({ name: "test.hourly", title: "Hourly", workflow: "test.counter", cron: "0 * * * *" })] }) });
  }, 60_000);
  afterAll(async () => void (await t?.drop()));

  it.each(["Bad/Zone", "Mars/Olympus", "Europe/Atlantis"])("an entity whose zone is %s records the error and the other schedules still fire", async (zone) => {
    await t.owner`alter table workflows.entity_zone disable trigger entity_zone_check`;
    await t.owner`insert into workflows.entity_zone (legal_entity_id, tenant_id, timezone) values (${NZ}, ${TENANT}, ${zone}) on conflict (legal_entity_id) do update set timezone = excluded.timezone`;
    await t.owner`alter table workflows.entity_zone enable trigger entity_zone_check`;
    await engine.tick();
    await t.owner`update workflows.schedule set last_error = null, locked_until = null, next_run_at = now() - interval '1 minute'`;
    expect((await engine.tick()).schedulesFired).toBe(2);
    const rows = await t.owner`select s.name, e.country, s.last_error, s.locked_until > now() as backed_off from workflows.schedule s left join core.legal_entity e on e.id = s.legal_entity_id order by s.name, e.country`;
    expect(rows.map((r) => [r.name, r.country, Boolean(r.last_error), Boolean(r.backed_off)])).toEqual([["test.hourly", null, false, false], ["test.sweep", "LK", false, false], ["test.sweep", "NZ", true, true]]);
  });

  it.each(["ensure_schedules(jsonb, jsonb)", "claim_schedules(int, int, jsonb)"])("reports schedulesError when %s fails, and still drives runs", async (fn) => {
    const id = await engine.start(TENANT, "test.counter", null, { startedBy: "test" });
    await t.owner.unsafe(`alter function workflows.${fn} rename to broken_for_test`);
    try {
      const result = await engine.tick();
      expect(result.schedulesError).toMatch(/does not exist/);
      expect(result.runs).toBeGreaterThanOrEqual(1);
    } finally {
      await t.owner.unsafe(`alter function workflows.broken_for_test(${fn.split("(")[1]} rename to ${fn.split("(")[0]}`);
    }
    expect((await t.owner`select status from workflows.run where id = ${id}`)[0].status).toBe("completed");
  });
});
