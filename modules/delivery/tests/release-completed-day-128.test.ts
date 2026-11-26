import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { hasDb } from "@amax/db/testdb";
import { createRelease, recordDeployment } from "../server/services";
import { getProject, getRelease, listEnvironments } from "../server/queries";
import { dayLabel } from "../server/release-status";
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

  it("AC-3 the migration fills the day of a release completed before it, in its project's zone then; UTC without one", async () => {
    await zoneTo(null);
    await createRelease(db.admin(), { ...OPEN, projectKey: "RTK", version: "b-utc" });
    await recordDeployment(db.admin(), { projectKey: "RTK", version: "b-utc", environment: "UAT" });
    // The database as 0026 left it: no day, and 0025's check, which doesn't ask for one.
    const before = async () => db.t.owner`alter table delivery.release drop constraint release_completed_whole; update delivery.release set completed_day = null;
      alter table delivery.release add constraint release_completed_whole check ((status = 'completed') = (completed_at is not null and completion is not null and completing_deployment_id is not null) or status is null)`.simple();
    for (const zone of ["Pacific/Kiritimati", null]) {
      await zoneTo(zone);
      await before();
      await db.t.owner.unsafe(migration.replace(/^alter table delivery\.release add column completed_day date;$/m, ""));
      const rows = await db.t.owner`select r.version, r.completed_at, r.completed_day::text as day from delivery.release r join delivery.project p on p.id = r.project_id where p.key = 'RTK' and r.completed_at is not null`;
      expect(rows.length).toBeGreaterThan(0);
      for (const r of rows) expect(r.day).toBe(dayIn(zone ?? "UTC", (r.completed_at as Date).toISOString()));
    }
  });

  it("AC-1 a completed release without its day is refused", async () => {
    await expect(db.t.owner`update delivery.release set completed_day = null where version = 'b-utc'`).rejects.toThrow(/release_completed_whole/);
  });
});
