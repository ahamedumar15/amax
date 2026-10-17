import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Db } from "@amax/db";
import { hasDb } from "@amax/db/testdb";
import { cron } from "../src";
import { createPostgresEngine, listSchedules, setScheduleEnabled, type WorkflowEngine } from "../src/server";
import { admin, database, TENANT, testRegistry } from "./harness";

const LK = "00000000-0000-4000-8000-0000000003a1";
const AU = "00000000-0000-4000-8000-0000000003a2";
const sweep = cron({ name: "test.sweep", title: "Unused licence sweep", workflow: "test.approval", cron: "0 6 * * *", timezone: "entity", input: { id: "sweep", timeout: "1s" } });
const nightly = cron({ name: "test.nightly", title: "Nightly", workflow: "test.approval", cron: "30 1 * * *", enabled: false });
const registry = testRegistry({ schedules: [sweep, nightly] });

describe.skipIf(!hasDb)("AC-6 cron schedules per legal entity", () => {
  let t: Awaited<ReturnType<typeof database>>;
  let db: Db;
  let engine: WorkflowEngine;
  beforeAll(async () => {
    t = await database();
    await t.owner`insert into core.legal_entity (id, tenant_id, name, country, base_currency) values (${LK}, ${TENANT}, 'Lumen Labs Lanka', 'LK', 'LKR'), (${AU}, ${TENANT}, 'Lumen Labs Australia', 'AU', 'AUD')`;
    db = t.app();
    engine = createPostgresEngine({ db, registry });
  }, 60_000);
  afterAll(async () => void (await t?.drop()));

  it("fires each entity's 06:00 in its own zone, and a disabled schedule creates no runs", async () => {
    await engine.tick();
    const rows = await listSchedules(db, registry, TENANT);
    const by = (entity: string | null, name = "test.sweep") => rows.find((r) => r.entity === entity && r.name === name)!;
    expect(by("Lumen Labs Lanka").timezone).toBe("Asia/Colombo");
    expect(by("Lumen Labs Australia").timezone).toBe("Australia/Sydney");
    expect(new Date(by("Lumen Labs Lanka").nextRunAt!).toISOString()).toMatch(/T00:30:00/);
    expect(new Date(by("Lumen Labs Australia").nextRunAt!).getUTCHours()).toBeOneOf([19, 20]);
    expect(by(null, "test.nightly")).toMatchObject({ timezone: "UTC", enabled: false });

    await setScheduleEnabled(db, admin, by("Lumen Labs Australia").id, false);
    await t.owner`update workflows.schedule set next_run_at = now() - interval '1 minute'`;
    await engine.tick();
    await engine.tick();
    const runs = await t.owner`select r.input, r.started_by, s.timezone from workflows.run r join workflows.schedule s on s.id = r.schedule_id`;
    expect(runs.map((r) => [r.timezone, r.input])).toEqual([["Asia/Colombo", { id: "sweep", timeout: "1s", legalEntityId: LK }]]);
    const after = await listSchedules(db, registry, TENANT);
    expect(after.find((r) => r.entity === "Lumen Labs Lanka")).toMatchObject({ enabled: true, lastStatus: expect.any(String) });
    expect(after.find((r) => r.entity === "Lumen Labs Australia")).toMatchObject({ enabled: false, lastRunAt: null });
    const [audit] = await t.owner`select action, actor, after from core.audit_event where resource = 'workflows.schedule'`;
    expect(audit).toMatchObject({ action: "workflows.schedule.disable", actor: "user:u-admin", after: { enabled: false, name: "test.sweep" } });
  }, 60_000);
});
