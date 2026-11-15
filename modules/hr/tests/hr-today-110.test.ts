import { sql } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { hasDb } from "@amax/db/testdb";
import { ctxFor } from "../server/context";
import { contextFor } from "@amax/core/server";
import { getEmployment, getPerson, listPeople } from "../contracts";
import { changePerson } from "../server/services";
import { hrDatabase } from "./setup";

// 110: at 20:00 UTC on the 15th it is already the 16th in Sri Lanka and Sydney. HR's changes and reads go by that date.
const EVENING = "2026-11-15T20:00:00Z";

describe.skipIf(!hasDb)("110 HR's one today for changes and reads (Postgres)", () => {
  let db: Awaited<ReturnType<typeof hrDatabase>>;
  beforeAll(async () => { db = await hrDatabase(); }, 60_000);
  afterAll(() => db?.t.drop());
  afterEach(() => { vi.useRealTimers(); });
  const at = (now: string) => { vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date(now)); };
  const someoneIn = async (country: string) => (await db.tx((tx) => tx.execute(sql`select p.employee_no from hr.person p join core.legal_entity e on e.id = p.legal_entity_id
    where e.country = ${country} and p.status = 'active' order by p.employee_no limit 1`)))[0].employee_no as string;

  it.each([
    ["Sri Lanka, a title with no date", "LK", { title: "Senior engineer" }],
    ["Sydney, a title with no date", "AU", { title: "Account lead" }],
    ["Sri Lanka, a department with no date", "LK", { department: "Quality" }],
    ["Sri Lanka, a title on its own today", "LK", { title: "Lead engineer", effectiveOn: "2026-11-16" }],
  ])("AC1 %s: changes on the entity's own today", async (_name, country, change) => {
    const employeeNo = await someoneIn(country);
    at(EVENING);
    const r = await changePerson(ctxFor(db.mayaAs("HR")), { employeeNo, ...change });
    expect(r.effectiveOn).toBe("2026-11-16");
  });

  it.each([
    ["get_person", "LK"], ["the directory (listPeople)", "AU"], ["the employment in force", "LK"],
  ])("AC2 a department changed on the entity's today shows at once in %s", async (reader, country) => {
    const employeeNo = await someoneIn(country);
    at(EVENING);
    await changePerson(ctxFor(db.mayaAs("HR")), { employeeNo, department: `Dept ${reader}` });
    const system = contextFor.job(db.maya.tenantId, "hr.test");
    const department = await db.tx(async (tx) => {
      const p = (await getPerson(tx, system, employeeNo))!;
      if (reader === "get_person") return p.department;
      if (reader === "the directory (listPeople)") return (await listPeople(tx, system, { ids: [p.id] }))[0].department;
      return (await getEmployment(tx, p.id, system))!.department;
    });
    expect(department).toBe(`Dept ${reader}`);
  });

  it("AC1 an entity with no time zone is refused", async () => {
    const employeeNo = await someoneIn("AU");
    await db.t.owner`delete from workflows.entity_zone where legal_entity_id in (select id from core.legal_entity where country = 'AU')`;
    at(EVENING);
    await expect(changePerson(ctxFor(db.mayaAs("HR")), { employeeNo, title: "Director" })).rejects.toThrow(/Lumen Labs Pty Ltd has no time zone set/);
    await db.t.owner`insert into workflows.entity_zone (legal_entity_id, tenant_id, timezone) select id, tenant_id, 'Australia/Sydney' from core.legal_entity where country = 'AU' on conflict (legal_entity_id) do nothing`;
  });
});
