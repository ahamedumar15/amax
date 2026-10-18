import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { hasDb } from "@amax/db/testdb";
import { contextFor } from "@amax/core/server";
import manifest from "../module";
import { EVENTS, type CertificationExpiring } from "../contracts";
import { remindDue } from "../server/certifications";
import { learningDb, T } from "./db";

describe("AC-2 expiry reminders are a scheduled workflow", () => {
  it("AC2 the manifest registers the daily certification-expiry workflow and its schedule", () => {
    expect((manifest.workflows as { name: string }[]).map((w) => w.name)).toEqual(["learning.certification-expiry"]);
    expect(manifest.schedules).toEqual([expect.objectContaining({ name: "learning.certification-expiry", workflow: "learning.certification-expiry", cron: "0 6 * * *" })]);
  });
});

describe.skipIf(!hasDb)("AC-2 the daily sweep (Postgres)", () => {
  let db: Awaited<ReturnType<typeof learningDb>>;
  beforeAll(async () => { db = await learningDb(); }, 60_000);
  afterAll(() => db?.t.drop());
  const sweep = (on: string) => remindDue(contextFor.job(T, "learning.certification-expiry"), { on });

  it("AC2 reminds each certification once per window, emitting the event notifications sends", async () => {
    expect(await sweep("2026-10-16")).toEqual({ sent: 1 });
    expect(await sweep("2026-10-16")).toEqual({ sent: 0 });
    const [e] = await db.q(sql`select payload from core.event where name = ${EVENTS.certificationExpiring}`);
    expect(e.payload as CertificationExpiring).toMatchObject({ name: "AZ-305 Solutions Architect", userId: (await db.as("nimal")).userId, expiresOn: "2026-12-02", daysLeft: 47, kind: "scheduled" });
    expect(manifest.notifications?.map((r) => [r.event, r.to])).toEqual([[EVENTS.certificationExpiring, [{ owner: "userId" }]]]);
    expect(await sweep("2026-11-01")).toEqual({ sent: 5 });
    expect(await sweep("2026-11-20")).toEqual({ sent: 1 });
    const windows = await db.q(sql`select window_days, count(*)::int as n from learning.reminder group by 1 order by 1`);
    expect(windows).toEqual([{ window_days: 14, n: 1 }, { window_days: 60, n: 6 }]);
    const [audit] = await db.q(sql`select actor, source from core.audit_event where action = 'learning.certification.remind_due' order by seq desc limit 1`);
    expect(audit).toMatchObject({ source: "job" });
  });
});
