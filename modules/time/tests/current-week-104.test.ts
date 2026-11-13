import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { hasDb } from "@amax/db/testdb";
import { isoWeekOf, weekKey } from "../week";
import { myWeek } from "../server/my";
import { hoursTrend, timeOverview } from "../server/overview";
import { teamWeek } from "../server/team";
import { T, timeDb } from "./db";

// 104 AC-15 (amendment 2): with no week asked for, Team time, My timesheet and the hours trend open on the viewer's
// current week, not on the latest week that has a timesheet (the fixtures' 2026-W42).
describe.skipIf(!hasDb)("104 AC-15 screens open on the current week", () => {
  let db: Awaited<ReturnType<typeof timeDb>>;
  beforeAll(async () => { db = await timeDb(); }, 60_000);
  afterAll(() => db?.t.drop());

  it("AC-15 Team time, My timesheet and the hours trend default to this week for an approver", async () => {
    const maya = await db.as("maya", "PM");
    const now = weekKey(isoWeekOf(new Date()));
    const team = await teamWeek(maya);
    expect(team.key).toBe(now);
    expect(team.key).not.toBe("2026-W42");
    expect(weekKey((await myWeek(maya)).week)).toBe(now);
    expect((await hoursTrend(maya, { weeks: 4 })).at(-1)?.week).toBe(now);
    // Submitted weeks wait whatever week they're from: the fixtures' W42 is still on the Overview this week.
    const overview = await timeOverview(maya, {});
    expect(overview.tickets?.[0]).toMatchObject({ label: "Hours this week", pin: { args: { week: now } } });
    expect(overview.waiting?.map((w) => w.title)).toEqual(["W42 timesheets"]);
    void T;
  });
});
