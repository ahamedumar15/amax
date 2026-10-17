import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { hasDb } from "@amax/db/testdb";
import { isMasked } from "@amax/auth";
import manifest from "../module";
import { EVENTS, getEmployment, getPerson, listEmploymentPeriods, listPeople, reportUserIds } from "../contracts";
import { sql } from "drizzle-orm";
import { contextFor, type ServiceContext } from "@amax/core/server";
import type { Viewer } from "@amax/auth";
import { hrDatabase, T } from "./setup";

describe("AC-4 contract shape", () => {
  it("names the three events the manifest emits", () => {
    expect(EVENTS).toEqual({ personJoined: "hr.person.joined", personLeft: "hr.person.left", personChanged: "hr.person.changed" });
    expect(manifest.events?.emits).toEqual(Object.values(EVENTS));
  });
});

describe.skipIf(!hasDb)("AC-4 contract reads (Postgres)", () => {
  let db: Awaited<ReturnType<typeof hrDatabase>>;
  beforeAll(async () => { db = await hrDatabase(); }, 60_000);
  afterAll(() => db?.t.drop());

  const sys = () => contextFor.job(T, "hr.test");

  it("getPerson, listPeople(scope), listEmploymentPeriods, reportUserIds", async () => {
    const r = sys();
    await db.tx(async (tx) => {
      const kasun = (await getPerson(tx, r, "LL-0417"))!;
      expect(kasun).toMatchObject({ name: "Kasun Dias", department: "Engineering", managerName: "Maya Fernando", status: "active", joinedOn: "2022-03-03" });
      expect((await getPerson(tx, r, kasun.id))?.employeeNo).toBe("LL-0417");
      expect(await getPerson(tx, r, "LL-9999")).toBeNull();
      expect(await listPeople(tx, r, { status: ["active"] })).toHaveLength(184);
      const team = await listPeople(tx, r, { managerPersonId: (await getPerson(tx, r, "LL-0102"))!.id });
      expect(team.map((p) => p.name).sort()).toEqual(["Ayesha Rahman", "Dinesh Wickrama", "Kasun Dias", "Nimal Silva", "Tharushi Wijesinghe"]);
      expect(await listPeople(tx, r, { ids: [] })).toEqual([]);
      const periods = await listEmploymentPeriods(tx, r, [kasun.id]);
      expect(periods).toEqual([{ personId: kasun.id, legalEntityId: kasun.legalEntityId, department: "Engineering", fte: 1, contract: "permanent", startsOn: "2022-03-03", endsOn: null }]);
      expect(await reportUserIds(tx, db.maya.userId)).toHaveLength(5);
    });
  });

  it("getEmployment masks pay and bank per 002: PM neither, Payroll both, HR neither, self sees all", async () => {
    await db.tx(async (tx) => {
      const id = (await getPerson(tx, sys(), "LL-0417"))!.id;
      const pm = (await getEmployment(tx, id, db.mayaAs("PM")))!;
      expect(isMasked(pm.baseSalary) && isMasked(pm.bankAccount) && isMasked(pm.epfNumber)).toBe(true);
      expect(pm.grade).toBe("E4");
      const payroll = (await getEmployment(tx, id, db.mayaAs("Payroll")))!;
      expect([payroll.baseSalary, payroll.bankAccount]).toEqual(["285000.0000", "8001207740"]);
      const hrRole = (await getEmployment(tx, id, db.mayaAs("HR")))!;
      expect(isMasked(hrRole.baseSalary)).toBe(true);
      expect((await getEmployment(tx, id, await db.as("kasun")))!.bankName).toBe("Commercial Bank");
    });
  });

  it("system code reads pay unmasked, and every such read is audited", async () => {
    const id = await db.tx(async (tx) => (await getPerson(tx, sys(), "LL-0417"))!.id);
    const e = await db.tx((tx) => getEmployment(tx, id, sys()));
    expect(e!.baseSalary).toBe("285000.0000");
    const [a] = await db.tx((tx) => tx.execute(sql`select actor, action, resource from core.audit_event where action = 'hr.employment.read' order by seq desc limit 1`));
    expect(a).toMatchObject({ actor: "job:hr.test", action: "hr.employment.read", resource: "hr.employment" });
  });

  // Every contract read applies the reader's data scope: entities their hr:read reaches, nothing without it.
  it.each([
    // Maya (Sri Lanka) always sees herself.
    { who: "HR for Australia only", entity: "au", people: 13 + 1 },
    { who: "HR for Sri Lanka only", entity: "lk", people: 171 },
    { who: "Engineer (no hr:read)", entity: null, people: 1 },
  ])("contract reads are scoped to the reader: $who", async ({ entity, people }) => {
    await db.tx(async (tx) => {
      const [le] = entity ? await tx.execute(sql`select id from core.legal_entity where lower(country) = ${entity}`) : [undefined];
      const v: Viewer = { ...db.maya, viewAs: undefined, assignments: [entity ? { role: "HR", legalEntityIds: [le!.id as string], departments: null } : { role: "Engineer", legalEntityIds: null, departments: null }] };
      const seen = await listPeople(tx, v, { status: ["active"] });
      expect(seen).toHaveLength(people);
      const kasun = (await getPerson(tx, sys(), "LL-0417"))!;
      const visible = entity === "lk";
      expect(Boolean(await getPerson(tx, v, "LL-0417"))).toBe(visible);
      expect((await listEmploymentPeriods(tx, v, [kasun.id])).length > 0).toBe(visible);
      expect(Boolean(await getEmployment(tx, kasun.id, v))).toBe(visible);
    });
  });

  it.each([
    { who: "HR for Engineering only", departments: ["Engineering"], kasun: true, active: 112 + 1 },
    { who: "HR for Finance only", departments: ["Finance"], kasun: false, active: 6 + 1 },
  ])("department-scoped readers see only their departments: $who", async ({ departments, kasun, active }) => {
    await db.tx(async (tx) => {
      const v: Viewer = { ...db.maya, viewAs: undefined, assignments: [{ role: "HR", legalEntityIds: null, departments }] };
      expect(await listPeople(tx, v, { status: ["active"] })).toHaveLength(active);
      const id = (await getPerson(tx, sys(), "LL-0417"))!.id;
      expect(Boolean(await getEmployment(tx, id, v))).toBe(kasun);
      // A ServiceContext acting for that viewer reads as the viewer.
      const ctx = { tenantId: T, actor: { id: "user:x", kind: "user" }, source: "mcp", viewer: v } as ServiceContext;
      expect(Boolean(await getPerson(tx, ctx, "LL-0417"))).toBe(kasun);
    });
  });

  it.each(["service", "agent", "user"] as const)("a %s context without a viewer can't read people", async (kind) => {
    const ctx = { tenantId: T, actor: { id: `${kind}:x`, kind }, source: "api" } as ServiceContext;
    await db.tx(async (tx) => {
      await expect(listPeople(tx, ctx)).rejects.toThrow(/forbidden/);
      await expect(getPerson(tx, ctx, "LL-0417")).rejects.toThrow(/forbidden/);
    });
  });
});
