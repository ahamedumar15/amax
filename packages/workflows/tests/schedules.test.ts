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
    expect(audit).toMatchObject({ action: "workflows.schedule.toggle", actor: "user:u-admin", after: { enabled: false, name: "test.sweep" } });
  }, 60_000);
});
