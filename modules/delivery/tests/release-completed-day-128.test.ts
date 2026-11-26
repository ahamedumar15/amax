import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { hasDb } from "@amax/db/testdb";
import { createRelease, recordDeployment } from "../server/services";
import { getProject, getRelease, listEnvironments } from "../server/queries";
import { withTenant } from "@amax/db";
import { entityZone } from "@amax/workflows";
import { dayLabel, releaseDay } from "../server/release-status";
import { ReleaseBody } from "../ui/ReleasePage";
import { OPEN, releaseDb, T } from "./release-db";

const dayIn = (zone: string, at: string) => new Intl.DateTimeFormat("en-CA", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(at));
const migration = readFileSync(new URL("../db/migrations/0027_release_completed_day.sql", import.meta.url), "utf8");

describe.skipIf(!hasDb)("128 a completed release keeps the day it completed on (Postgres)", () => {
  let db: Awaited<ReturnType<typeof releaseDb>>;
  let entity: string;
  const zoneTo = async (zone: string | null) => {
    if (zone) await db.t.owner`insert into workflows.entity_zone (legal_entity_id, tenant_id, timezone) values (${entity}, ${T}, ${zone}) on conflict (legal_entity_id) do update set timezone = excluded.timezone`;
    await db.t.owner`update delivery.project set legal_entity_id = ${zone ? entity : null} where key = 'RTK'`;
  };
  const page = async (version: string) => {
    const [release, envs, project] = await Promise.all([getRelease(db.sahan, "RTK", version), listEnvironments(db.sahan, "RTK"), getProject(db.sahan, "RTK")]);
    return renderToStaticMarkup(createElement(ReleaseBody, { viewer: db.sahan, release: { ...release!, projectId: project!.project.id }, envs }));
  };
  beforeAll(async () => {
    db = await releaseDb();
    entity = (await db.t.owner`select id from core.legal_entity where tenant_id = ${T} limit 1`)[0].id as string;
  }, 120_000);
  afterAll(() => db?.t.drop());

  it.each([
    { from: "Pacific/Kiritimati", to: "Pacific/Pago_Pago" },
    { from: "Pacific/Pago_Pago", to: "Pacific/Kiritimati" },
    { from: "Asia/Colombo", to: null },
  ])("AC-1 AC-2 completed in $from, the day and On time stay after the project moves to $to", async ({ from, to }) => {
    await zoneTo(from);
    const version = `k-${from}`.replace(/\W+/g, "-");
    const targetDate = dayIn(from, new Date().toISOString());
    await createRelease(db.admin(), { ...OPEN, projectKey: "RTK", version, targetDate });
    await recordDeployment(db.admin(), { projectKey: "RTK", version, environment: "UAT" });
    const done = (await getRelease(db.sahan, "RTK", version))!;
    const day = dayIn(from, done.completedAt!);
    expect([done.completedDay, done.completion]).toEqual([day, "on_time"]);
    await zoneTo(to);
    if (to) expect(dayIn(to, done.completedAt!)).not.toBe(day);
    const after = (await getRelease(db.sahan, "RTK", version))!;
    expect([after.completedDay, after.completion]).toEqual([day, "on_time"]);
    expect(await page(version)).toContain(`<dt>Completed</dt><dd>${dayLabel(day)} · On time</dd>`);
  });

  // The backfill against the rule completeBy judged by (entityZone): own zone, the country's default, none (UTC).
  it("AC-3 the migration fills the day of a release completed before it by entityZone's rule: own zone, country default, UTC", async () => {
    const [lk, other] = await Promise.all(["=", "<>"].map(async (op) => (await db.t.owner`select id from core.legal_entity where tenant_id = ${T} and country ${db.t.owner.unsafe(op)} 'LK' limit 1`)[0].id as string));
    await db.t.owner`delete from workflows.entity_zone where legal_entity_id = ${lk}`;
    await db.t.owner`insert into workflows.entity_zone (legal_entity_id, tenant_id, timezone) values (${other}, ${T}, 'Pacific/Kiritimati') on conflict (legal_entity_id) do update set timezone = excluded.timezone`;
    await zoneTo(null);
    await createRelease(db.admin(), { ...OPEN, projectKey: "RTK", version: "b1" });
    await recordDeployment(db.admin(), { projectKey: "RTK", version: "b1", environment: "UAT" });
    // The database as 0026 left it: no day, and 0025's check, which doesn't ask for one. Completed at an instant whose day
    // differs by zone (20:00 UTC on 12 Dec is 13 Dec in Colombo and Kiritimati), so a wrong zone step can't pass.
    const before = async () => db.t.owner`alter table delivery.release drop constraint release_completed_whole;
      update delivery.release set completed_day = null, completed_at = case when completed_at is null then null else '2026-12-12T20:00:00Z'::timestamptz end;
      alter table delivery.release add constraint release_completed_whole check ((status = 'completed') = (completed_at is not null and completion is not null and completing_deployment_id is not null) or status is null)`.simple();
    for (const [legalEntity, own, day] of [[other, "Pacific/Kiritimati", "2026-12-13"], [lk, null, "2026-12-13"], [null, null, "2026-12-12"]] as const) {
      await db.t.owner`update delivery.project set legal_entity_id = ${legalEntity} where key = 'RTK'`;
      const zone = await withTenant(db.app, T, (tx) => entityZone(tx, legalEntity));
      expect(zone).toBe(own ?? (legalEntity ? "Asia/Colombo" : "UTC"));
      await before();
      await db.t.owner.unsafe(migration.replace(/^alter table delivery\.release add column completed_day date;$/m, ""));
      const rows = await db.t.owner`select r.completed_at, r.completed_day::text as day from delivery.release r join delivery.project p on p.id = r.project_id where p.key = 'RTK' and r.completed_at is not null`;
      expect(rows.length).toBeGreaterThan(0);
      for (const r of rows) expect([r.day, releaseDay(zone, r.completed_at as Date)]).toEqual([day, day]);
    }
  });

  it("AC-1 a completed release without its day is refused", async () => {
    await createRelease(db.admin(), { ...OPEN, projectKey: "RTK", version: "c1" });
    await recordDeployment(db.admin(), { projectKey: "RTK", version: "c1", environment: "UAT" });
    await expect(db.t.owner`update delivery.release set completed_day = null where version = 'c1'`).rejects.toThrow(/release_completed_whole/);
  });
});
