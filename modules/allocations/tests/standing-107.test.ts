import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { hasDb } from "@amax/db/testdb";
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
  const months = async (who: string, key: string) => (await db.tx((tx) => tx.execute(sql`select to_char(a.month, 'YYYY-MM') as m, a.percent from allocations.allocation a
    join hr.person p on p.id = a.person_id join delivery.project j on j.id = a.project_id where p.name = ${who} and j.key = ${key} order by a.month`))).map((r) => `${r.m}:${r.percent}`);

  it("AC3 until further notice writes every month ahead; percent 0 ends it from that month and keeps the months before", async () => {
    const maya = ctxFor(await db.as("maya"), "mcp");
    await allocate(maya, { person: "Tharushi Wijesinghe", projectKey: "CON", month: "2027-03", percent: 40, standing: true });
    expect(await months("Tharushi Wijesinghe", "CON")).toEqual(expect.arrayContaining(["2027-03:40", "2028-02:40"]));
    await allocate(maya, { person: "Tharushi Wijesinghe", projectKey: "CON", month: "2027-06", percent: 25 });
    await allocate(maya, { person: "Tharushi Wijesinghe", projectKey: "CON", month: "2027-09", percent: 0, standing: true });
    const after = await months("Tharushi Wijesinghe", "CON");
    expect(after).toEqual(expect.arrayContaining(["2027-03:40", "2027-06:25", "2027-08:40"]));
    expect(after.some((m) => m >= "2027-09")).toBe(false);
  });

  it("AC4 the monthly job writes the next month for anyone standing, never over a month set by hand, and Team marks them", async () => {
    const maya = ctxFor(await db.as("maya"), "mcp");
    await allocate(maya, { person: "Dinesh Wickrama", projectKey: "CON", month: "2026-10", percent: 50, standing: true });
    await allocate(maya, { person: "Dinesh Wickrama", projectKey: "CON", month: "2027-10", percent: 10 });
    await extendStanding(contextFor.job(T, "allocations.standing-extend"), { today: "2026-12-05" });
    expect(await months("Dinesh Wickrama", "CON")).toEqual(expect.arrayContaining(["2027-10:10", "2027-11:50"]));
    const team = await teamFor(await db.as("maya"), "CON", new Date("2026-10-16T12:00:00Z"));
    expect(team?.people.find((p) => p.name === "Dinesh Wickrama")?.standing).toBe(true);
    await expect(extendStanding(maya, { today: "2026-12-05" })).rejects.toThrow();
  });
});
