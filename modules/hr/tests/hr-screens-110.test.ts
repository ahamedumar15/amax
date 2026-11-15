import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { hasDb } from "@amax/db/testdb";
import { ctxFor } from "../server/context";
import { addPerson } from "../server/services";
import { peopleStats } from "../server/stats";
import { shortDate } from "../ui/parts";
import { PeopleAllPage } from "../ui/PeoplePage";
import { PersonPage } from "../ui/PersonPage";
import { hrDatabase } from "./setup";

const html = async (node: unknown) => (await import("react-dom/server")).renderToStaticMarkup((await node) as never);

// 110 AC-2, review round 2: the screens read each person's own day, not UTC's. At 20:00 UTC on 15 Nov it is the 16th in
// Sri Lanka; at 20:00 UTC on 30 Nov it is already 1 Dec there, another month.
describe.skipIf(!hasDb)("110 the People screens read each person's own day (Postgres)", () => {
  let db: Awaited<ReturnType<typeof hrDatabase>>;
  beforeAll(async () => { db = await hrDatabase(); }, 60_000);
  afterAll(() => db?.t.drop());
  afterEach(() => { vi.useRealTimers(); });
  const at = (now: string) => { vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date(now)); };
  const join = async (name: string) => (await addPerson(ctxFor(await db.as("sahan"), "mcp"), { name, title: "Engineer", department: "Engineering", entity: "Sri Lanka" })).employeeNo;

  it.each([
    ["the person page", async (no: string) => html(PersonPage({ params: { employeeNo: no }, viewer: db.mayaAs("HR") } as never))],
    ["the People directory", async () => html(PeopleAllPage({ params: {}, viewer: db.mayaAs("HR") } as never))],
  ])("AC2 %s shows someone who joined today there as joined today", async (_name, render) => {
    at("2026-11-15T20:00:00Z");
    const no = await join(`Joiner ${_name}`);
    expect(await render(no)).toContain(`Joined ${shortDate("2026-11-16")}`);
  });

  it("AC2 the People stats count by each person's month: a probation due and a joiner in December, the screen's day 1 Dec", async () => {
    at("2026-11-30T20:00:00Z");
    const hr = db.mayaAs("HR");
    const before = await peopleStats(hr);
    const no = await join("December joiner 110");
    await db.t.owner`insert into hr.probation (tenant_id, person_id, ends_on) select tenant_id, id, '2026-12-15' from hr.person where employee_no = ${no}`;
    const after = await peopleStats(hr);
    expect([after.day, after.months.length, after.probation.dueThisMonth - before.probation.dueThisMonth, after.joiners[11] - (before.joiners[11] ?? 0)]).toEqual(["2026-12-01", 12, 1, 1]);
  });
});
