import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { hasDb } from "@amax/db/testdb";
import { isMasked } from "@amax/auth";
import manifest from "../module";
import { EVENTS, getEmployment, getPerson, listEmploymentPeriods, listPeople, reportUserIds } from "../contracts";
import { hrDatabase } from "./setup";

describe("AC-4 contract shape", () => {
  it("names the three events the manifest emits", () => {
    expect(EVENTS).toEqual({ personJoined: "hr.person.joined", personLeft: "hr.person.left", personChanged: "hr.person.changed" });
    expect(manifest.events?.emits).toEqual(Object.values(EVENTS));
  });
});

describe.skipIf(!hasDb)("AC-4 contract reads (Postgres)", () => {
  let db: Awaited<ReturnType<typeof hrDatabase>>;
  beforeAll(async () => { db = await hrDatabase(); });
  afterAll(() => db?.t.drop());

  it("getPerson, listPeople(scope), listEmploymentPeriods, reportUserIds", async () => {
    await db.tx(async (tx) => {
      const kasun = (await getPerson(tx, "LL-0417"))!;
      expect(kasun).toMatchObject({ name: "Kasun Dias", department: "Engineering", managerName: "Maya Fernando", status: "active", joinedOn: "2022-03-03" });
      expect((await getPerson(tx, kasun.id))?.employeeNo).toBe("LL-0417");
      expect(await getPerson(tx, "LL-9999")).toBeNull();
      expect(await listPeople(tx, { status: ["active"] })).toHaveLength(184);
      const team = await listPeople(tx, { managerPersonId: (await getPerson(tx, "LL-0102"))!.id });
      expect(team.map((p) => p.name).sort()).toEqual(["Ayesha Rahman", "Dinesh Wickrama", "Kasun Dias", "Nimal Silva", "Tharushi Wijesinghe"]);
      expect(await listPeople(tx, { ids: [] })).toEqual([]);
      const periods = await listEmploymentPeriods(tx, [kasun.id]);
      expect(periods).toEqual([{ personId: kasun.id, legalEntityId: kasun.legalEntityId, department: "Engineering", fte: 1, contract: "permanent", startsOn: "2022-03-03", endsOn: null }]);
      expect(await reportUserIds(tx, db.maya.userId)).toHaveLength(5);
    });
  });

  it("getEmployment masks pay and bank per 002: PM neither, Payroll both, HR neither, system and self see all", async () => {
    await db.tx(async (tx) => {
      const id = (await getPerson(tx, "LL-0417"))!.id;
      const pm = (await getEmployment(tx, id, db.mayaAs("PM")))!;
      expect(isMasked(pm.baseSalary) && isMasked(pm.bankAccount) && isMasked(pm.epfNumber)).toBe(true);
      expect(pm.grade).toBe("E4");
      const payroll = (await getEmployment(tx, id, db.mayaAs("Payroll")))!;
      expect([payroll.baseSalary, payroll.bankAccount]).toEqual(["285000.0000", "8001207740"]);
      const hrRole = (await getEmployment(tx, id, db.mayaAs("HR")))!;
      expect(isMasked(hrRole.baseSalary)).toBe(true);
      expect((await getEmployment(tx, id, "system"))!.baseSalary).toBe("285000.0000");
      expect((await getEmployment(tx, id, await db.as("kasun")))!.bankName).toBe("Commercial Bank");
    });
  });
});
