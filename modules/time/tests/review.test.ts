import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { withTenant } from "@amax/db";
import { hasDb } from "@amax/db/testdb";
import { projectHours, weekTotals } from "../contracts";
import { ctxFor } from "../server/context";
import { approveWeek } from "../server/decide";
import { logTime, workDay } from "../server/log";
import { wantedWeek } from "../server/weeks";
import { csvCell } from "../ui/Timesheets";
import { T, timeDb } from "./db";

const W = { year: 2026, week: 42 };
const range = { from: "2026-10-12", to: "2026-10-16" };

describe("week and day inputs", () => {
  it.each([
    [undefined, undefined],
    ["", undefined],
    ["2026-W42", { year: 2026, week: 42 }],
    ["2020-W53", { year: 2020, week: 53 }],
  ])("wantedWeek(%j) is %j", (key, want) => expect(wantedWeek(key)).toEqual(want));

  it.each(["2026-W54", "2021-W53", "2026-W00", "2026-42", "next week"])("wantedWeek(%j) throws instead of falling back to another week", (key) => {
    expect(() => wantedWeek(key)).toThrow(/isn't an ISO week/);
  });

  it.each([["2026-10-17", /weekend/], ["2026-10-18", /weekend/], ["2026-10-11", /weekend/], ["2026-02-30", /real date/], ["2026-13-01", /real date/]])(
    "workDay(%s) is refused", (day, err) => expect(() => workDay(day)).toThrow(err));

  it.each(["2026-10-12", "2026-10-16", "2027-01-01"])("workDay(%s) is a weekday", (day) => expect(workDay(day).getUTCDay()).toBeGreaterThan(0));
});

describe("CSV export cells", () => {
  it.each([
    ["Kasun Dias", '"Kasun Dias"'],
    ['Dinesh "DJ" Wickrama', '"Dinesh ""DJ"" Wickrama"'],
    ["=HYPERLINK(1)", `"'=HYPERLINK(1)"`],
    ["+1", `"'+1"`],
    ["-2", `"'-2"`],
    ["@SUM(A1)", `"'@SUM(A1)"`],
  ])("csvCell(%j) is %s", (v, want) => expect(csvCell(v)).toBe(want));
});

describe.skipIf(!hasDb)("review fixes (Postgres)", () => {
  let db: Awaited<ReturnType<typeof timeDb>>;
  beforeAll(async () => { db = await timeDb(); });
  afterAll(() => db?.t.drop());

  it.each([
    ["maya", ["Ayesha Rahman", "Dinesh Wickrama", "Kasun Dias", "Nimal Silva", "Tharushi Wijesinghe"]],
    ["nimal", ["Dinesh Wickrama", "Kasun Dias", "Nimal Silva", "Tharushi Wijesinghe"]],
    ["ayesha", ["Ayesha Rahman", "Dinesh Wickrama"]],
    ["liam", []],
  ])("weekTotals applies %s's data scope", async (key, names) => {
    const v = await db.as(key);
    expect((await withTenant(db.app, T, (tx) => weekTotals(tx, v, W))).map((p) => p.personName)).toEqual(names);
  });

  it("projectHours counts only the entries the caller may see", async () => {
    const [maya, ayesha, liam] = await Promise.all([db.as("maya"), db.as("ayesha"), db.as("liam")]);
    const total = async (v: typeof maya) => (await withTenant(db.app, T, (tx) => projectHours(tx, v, range))).reduce((n, p) => n + p.hours, 0);
    expect(await total(maya)).toBeCloseTo(141.5, 5);
    expect(await total(ayesha)).toBeLessThan(await total(maya));
    expect(await total(liam)).toBe(0);
  });

  it.each(["nimal", "kasun", "ayesha"])("%s can't add time to their submitted week", async (key) => {
    const v = await db.as(key);
    await expect(logTime(ctxFor(v), { projectKey: "CON", day: "2026-10-16", hours: 0.5 })).rejects.toThrow(/submitted and waiting/);
  });

  it.each(["2026-10-17", "2026-10-18"])("logTime refuses the weekend day %s", async (day) => {
    await expect(logTime(ctxFor(await db.as("tharushi")), { projectKey: "FLT", day, hours: 1 })).rejects.toThrow(/weekend/);
  });

  it("logTime needs a day: the server never guesses today in UTC", async () => {
    await expect(logTime(ctxFor(await db.as("tharushi")), { projectKey: "FLT", hours: 1 } as never)).rejects.toThrow(/invalid input/);
  });

  it("an Admin can't change their own approved week, another Admin can", async () => {
    const [maya, sahan] = await Promise.all([db.as("maya"), db.as("sahan")]);
    await logTime(ctxFor(maya), { projectKey: "CON", day: "2026-10-20", hours: 2 });
    await db.q(sql`update time.week set status = 'approved', locked_at = now() where user_id = ${maya.userId} and iso_year = 2026 and iso_week = 43`);
    await expect(logTime(ctxFor(maya), { projectKey: "CON", day: "2026-10-21", hours: 1 })).rejects.toThrow(/your own approved week/);
    await expect(logTime(ctxFor(sahan), { projectKey: "CON", day: "2026-10-21", hours: 1, userId: maya.userId })).resolves.toMatchObject({ week: "2026-W43" });
  });

  it.each(["Kasun Dias", "kasun dias", "KASUN DIAS"])("a name shared by two people (%s) is refused; the email still works", async (name) => {
    await db.q(sql`update time.week set person_name = 'Kasun Dias' where person_name = 'Dinesh Wickrama' and iso_year = 2026 and iso_week = 42`);
    const sahan = await db.as("sahan");
    await expect(approveWeek(ctxFor(sahan), { person: name, week: "2026-W42" })).rejects.toThrow(/more than one .* use their email/);
  });

  it("the email picks the right namesake", async () => {
    await expect(approveWeek(ctxFor(await db.as("sahan")), { person: "kasun@lumenlabs.test", week: "2026-W42" })).resolves.toMatchObject({ status: "approved", person: "Kasun Dias" });
  });
});
