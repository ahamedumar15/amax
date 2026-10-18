import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { withTenant } from "@amax/db";
import { hasDb, tablesMissingRls } from "@amax/db/testdb";
import manifest from "../module";
import { leaveOverview } from "../server/overview";
import { leaveDb } from "./db";

describe.skipIf(!hasDb)("leave schema and the Leave screen's numbers (Postgres)", () => {
  let db: Awaited<ReturnType<typeof leaveDb>>;
  beforeAll(async () => { db = await leaveDb(); }, 120_000);
  afterAll(() => db?.t.drop());

  it("AC1 policy, balance, request and holiday are tenant-isolated, installed from the country packs, and retention names real columns", async () => {
    expect(await tablesMissingRls(db.t.owner)).toEqual([]);
    const cols = async (table: string) => new Set((await db.t.owner`select column_name from information_schema.columns where table_schema = 'leave' and table_name = ${table}`).map((c) => c.column_name as string));
    for (const r of manifest.retention ?? []) {
      const have = await cols(r.table.split(".")[1]);
      expect([...r.fields, ...r.start.at, ...(r.subject ?? []), ...(r.subjectName ?? [])].filter((c) => !have.has(c)), r.label).toEqual([]);
    }
    expect(manifest.retention?.find((r) => r.class === "health")?.fields).toEqual(["medical_reason", "certificate_ref"]);
    const policies = await db.q(sql`select e.country, p.type, p.days_per_year from leave.policy p join core.legal_entity e on e.id = p.legal_entity_id order by e.country, p.type`);
    expect(policies.map((p) => `${p.country} ${p.type} ${p.days_per_year ?? "-"}`)).toEqual([
      "AU annual 20.0", "AU long-service -", "AU personal 10.0", "AU unpaid -", "LK annual 14.0", "LK casual 7.0", "LK lieu -", "LK medical 7.0", "LK unpaid -"]);
    expect(await db.q(sql`select name, kind from leave.holiday where country = 'LK' and on_date = '2026-10-26'`)).toEqual([{ name: "Vap Full Moon Poya Day", kind: "poya" }]);
    const other = "22222222-2222-4222-8222-222222222222";
    expect(await withTenant(db.app, other, (tx) => tx.execute(sql`select count(*)::int as n from leave.request`))).toEqual([{ n: 0 }]);
  });

  it("AC1 Maya's Leave screen matches fixtures.md: 6 on leave, 2 waiting (1 clash), 41 days by 19 people, 812 unused, 620 days by type and month", async () => {
    const o = await leaveOverview(await db.as("maya"));
    expect(o.today).toBe("2026-10-16");
    expect(o.stats.onLeave).toEqual({ people: 6, byType: [["annual", 3], ["casual", 2], ["medical", 1]] });
    expect(o.waiting.map((r) => [r.personName, r.dates, r.days, r.clashes])).toEqual([
      ["Nimal Silva", "Oct 27 – Oct 30", 4, ["Overlaps Fleet Tracker v1.8.0 UAT retry", "Overlaps Contoso Portal v2.4.0 QA"]], ["Tharushi Wijesinghe", "Nov 2", 1, []]]);
    expect(o.stats.booked).toEqual({ days: 41, people: 19 });
    expect(o.stats.unusedAnnual).toMatchObject({ days: 812, country: "LK" });
    expect(o.stats.byType).toEqual([["annual", 357], ["casual", 161], ["medical", 84], ["lieu", 18]]);
    expect(o.stats.perMonth.map((m) => m.days)).toEqual([58, 49, 71, 88, 64, 52, 61, 79, 57, 41]);
    expect(o.nextHoliday).toMatchObject({ on: "2026-10-26", name: "Vap Full Moon Poya Day" });
    const row = (name: string) => o.calendar.rows.find((r) => r.name === name)!.marks;
    expect(o.calendar.rows.map((r) => r.name)).toEqual(["Ayesha Rahman", "Dinesh Wickrama", "Kasun Dias", "Nimal Silva", "Tharushi Wijesinghe"]);
    expect([row("Ayesha Rahman")[15], row("Kasun Dias")[7], row("Nimal Silva")[26]]).toEqual(["casual", "medical", "pending"]);
  });
});
