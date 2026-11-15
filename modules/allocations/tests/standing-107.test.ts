import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { hasDb } from "@amax/db/testdb";
import { withTenant } from "@amax/db";
import { contextFor } from "@amax/core/server";
import { ctxFor } from "../server/context";
import { allocate } from "../server/services";
import { extendStanding } from "../server/standing";
import { teamFor } from "../server/team";
import { allocationsDatabase, T } from "./setup";

describe.skipIf(!hasDb)("107 standing allocations (Postgres)", () => {
  let db: Awaited<ReturnType<typeof allocationsDatabase>>;
  beforeAll(async () => { db = await allocationsDatabase(); }, 60_000);
  afterAll(() => db?.t.drop());
  const months = async (who: string) => Object.fromEntries((await db.tx((tx) => tx.execute(sql`select to_char(a.month, 'YYYY-MM') as m, a.percent from allocations.allocation a
    join hr.person p on p.id = a.person_id join delivery.project j on j.id = a.project_id where p.name = ${who} and j.key = 'CON'`))).map((r) => [r.m as string, Number(r.percent)]));
  let extended = false;
  const set = async (person: string, month: string, percent: number, standing?: boolean) => allocate(ctxFor(await db.as("maya"), "mcp"), { person, projectKey: "CON", month, percent, standing });

  it("AC3 a month set by hand wins over setting and ending until further notice; ending keeps the months before and the audit keeps what went", async () => {
    await set("Tharushi Wijesinghe", "2027-05", 25);
    await set("Tharushi Wijesinghe", "2027-03", 40, true);
    await set("Tharushi Wijesinghe", "2027-11", 15);
    await set("Tharushi Wijesinghe", "2027-09", 0, true);
    const m = await months("Tharushi Wijesinghe");
    expect([m["2027-03"], m["2027-05"], m["2027-08"], m["2027-09"], m["2027-11"], m["2028-02"]]).toEqual([40, 25, 40, undefined, 15, undefined]);
    const [audit] = await db.tx((tx) => tx.execute(sql`select before from core.audit_event where action = 'allocations.allocation.set' order by seq desc limit 1`));
    expect((audit.before as { rows: { month: string }[] }).rows.map((r) => r.month)).toContain("2028-02-01");
  });

  it.each([
    ["a month set by hand past what was written stays", "2027-10", 10],
    ["a month removed by hand past what was written isn't written back", "2027-11", undefined],
    ["the next month is written", "2027-12", 50],
  ])("AC4 the monthly job: %s", async (_name, month, expected) => {
    if (!extended) {
      extended = true;
      await set("Dinesh Wickrama", "2026-10", 50, true);
      await set("Dinesh Wickrama", "2027-10", 10);
      await set("Dinesh Wickrama", "2027-11", 0);
      for (const today of ["2026-12-05", "2027-01-05"]) await extendStanding(contextFor.job(T, "allocations.standing-extend"), { today });
    }
    expect((await months("Dinesh Wickrama"))[month]).toBe(expected);
  });

  it("B12 ending waits for the job's lock and removes the month the job was writing, in two sessions at once", async () => {
    await set("Kasun Dias", "2027-01", 30, true);
    const held = await withTenant(db.app, T, async (tx) => {
      const [s] = await tx.execute(sql`select s.id, s.person_id, s.project_id from allocations.standing s join hr.person p on p.id = s.person_id where p.name = 'Kasun Dias' and s.until_month is null for update`);
      await tx.execute(sql`insert into allocations.allocation (tenant_id, person_id, project_id, month, percent, updated_by, standing_id) values (${T}, ${s.person_id}, ${s.project_id}, '2028-01-01', 30, 'allocations.standing', ${s.id})`);
      const ending = set("Kasun Dias", "2027-06", 0, true);
      await new Promise((r) => setTimeout(r, 400));
      return { ending };
    });
    await held.ending;
    const m = await months("Kasun Dias");
    expect([m["2027-05"], m["2027-06"], m["2028-01"]]).toEqual([30, undefined, undefined]);
  });

  it("AC5 Team marks whoever stands on it; only a job may extend", async () => {
    const team = await teamFor(await db.as("maya"), "CON", new Date("2026-10-16T12:00:00Z"));
    expect(team?.people.find((p) => p.name === "Dinesh Wickrama")?.standing).toBe(true);
    await expect(extendStanding(ctxFor(await db.as("maya"), "mcp"), { today: "2026-12-05" })).rejects.toThrow();
  });
});
