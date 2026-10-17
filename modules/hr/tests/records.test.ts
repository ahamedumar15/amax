import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { hasDb } from "@amax/db/testdb";
import { contextFor, type ServiceContext } from "@amax/core/server";
import manifest from "../module";
import { getEmployment, getPerson, listEmploymentPeriods } from "../contracts";
import { ctxFor } from "../server/context";
import { inScope } from "../server/records";
import { addPerson, applyStatusDates, changePerson, entityOf, recordLeaver } from "../server/services";
import { peopleStats } from "../server/stats";
import { PeoplePage } from "../ui/PeoplePage";
import { hrDatabase, TODAY } from "./setup";

// Review round 1: effective dating, leavers, status dates, entity resolution, numbering and scope.
describe.skipIf(!hasDb)("hr records (Postgres)", () => {
  let db: Awaited<ReturnType<typeof hrDatabase>>;
  let hr: ServiceContext;
  const sys = () => contextFor.job(db.maya.tenantId, "hr.test");
  const periods = async (employeeNo: string) => db.tx(async (tx) => listEmploymentPeriods(tx, sys(), [(await getPerson(tx, sys(), employeeNo))!.id]));
  const hire = (name: string, joinedOn = "2026-01-05", extra: Record<string, unknown> = {}) =>
    addPerson(hr, { name, title: "Engineer", department: "Engineering", entity: "Sri Lanka", joinedOn, ...extra });

  beforeAll(async () => {
    db = await hrDatabase();
    hr = ctxFor(db.mayaAs("HR"));
  }, 60_000);
  afterAll(() => db?.t.drop());

  it.each([
    { later: [] as [string, number][] },
    { later: [["2027-02-01", 0.5]] as [string, number][] },
    { later: [["2027-02-01", 0.5], ["2027-04-01", 0.8]] as [string, number][] },
  ])("a department change carries into periods that already start later ($later.length later)", async ({ later }) => {
    const { employeeNo } = await hire(`Later ${later.length} Steps`);
    for (const [on, fte] of later) await changePerson(hr, { employeeNo, effectiveOn: on, fte });
    await changePerson(hr, { employeeNo, effectiveOn: "2026-11-01", department: "Quality" });
    const ps = await periods(employeeNo);
    expect(ps.filter((p) => p.startsOn >= "2026-11-01").map((p) => [p.startsOn, p.department, p.fte]))
      .toEqual([["2026-11-01", "Quality", 1], ...later.map(([on, fte]) => [on, "Quality", fte])]);
    expect(ps[0]).toMatchObject({ startsOn: "2026-01-05", department: "Engineering", endsOn: "2026-10-31" });
  });

  it.each([
    { name: "an FTE change ahead of an FTE step keeps the step", change: { fte: 0.6 }, plan: { fte: 0.5 }, col: "fte" as const, want: [0.6, 0.5] },
    { name: "a department change ahead of an FTE step carries forward", change: { department: "Quality" }, plan: { fte: 0.5 }, col: "department" as const, want: ["Quality", "Quality"] },
    { name: "a grade change ahead of a planned grade keeps the plan", change: { grade: "E3" }, plan: { grade: "E4" }, col: "grade" as const, want: ["E3", "E4"] },
  ])("later periods keep what they plan: $name", async ({ name, change, plan, col, want }) => {
    const { employeeNo } = await hire(`Plan ${name}`, "2026-01-05", { grade: "E2" });
    await changePerson(hr, { employeeNo, effectiveOn: "2027-02-01", ...plan });
    await changePerson(hr, { employeeNo, effectiveOn: "2026-11-01", ...change });
    const ps = (await periods(employeeNo)).filter((p) => p.startsOn >= "2026-11-01");
    const grades = await db.tx((tx) => tx.execute(sql`select e.grade from hr.employment e join hr.person p on p.id = e.person_id where p.employee_no = ${employeeNo} and e.starts_on >= '2026-11-01' order by e.starts_on`));
    expect(col === "grade" ? grades.map((g) => g.grade) : ps.map((p) => p[col])).toEqual(want);
  });

  it("a salary change ahead of a planned raise keeps the raise", async () => {
    const { employeeNo } = await hire("Plan Raise", "2026-01-05", { baseSalary: "100000" });
    await changePerson(hr, { employeeNo, effectiveOn: "2027-02-01", baseSalary: "130000" });
    await changePerson(hr, { employeeNo, effectiveOn: "2026-11-01", baseSalary: "110000" });
    const pay = await db.tx((tx) => tx.execute(sql`select e.starts_on::text as s, e.base_salary::text as pay from hr.employment e join hr.person p on p.id = e.person_id where p.employee_no = ${employeeNo} order by e.starts_on`));
    expect(pay.map((r) => [r.s, Number(r.pay)])).toEqual([["2026-01-05", 100000], ["2026-11-01", 110000], ["2027-02-01", 130000]]);
  });

  it("a leaver's removed periods are in the audit record, without pay values", async () => {
    const { employeeNo } = await hire("Audited Leaver", "2026-01-05", { baseSalary: "100000" });
    await changePerson(hr, { employeeNo, effectiveOn: "2027-02-01", fte: 0.5, baseSalary: "120000" });
    await recordLeaver(hr, { employeeNo, leftOn: "2026-12-31" });
    const [a] = await db.tx((tx) => tx.execute(sql`select before from core.audit_event where action = 'hr.person.leave' order by seq desc limit 1`));
    const before = a.before as { removedPeriods: Record<string, unknown>[] };
    expect(before.removedPeriods).toEqual([expect.objectContaining({ startsOn: "2027-02-01", fte: 0.5, department: "Engineering", hadPay: true })]);
    expect(JSON.stringify(before)).not.toContain("120000");
  });

  it.each([
    { name: "a future FTE step", joinedOn: "2026-01-05", step: "2027-02-01", leftOn: "2026-12-31", left: [["2026-01-05", "2026-12-31"]] },
    { name: "no later period", joinedOn: "2026-01-05", step: null, leftOn: "2026-12-31", left: [["2026-01-05", "2026-12-31"]] },
    { name: "a joiner who leaves before starting", joinedOn: "2027-01-04", step: null, leftOn: "2026-12-15", left: [] },
  ])("a leaver keeps no period open after the last day: $name", async ({ name, joinedOn, step, leftOn, left }) => {
    const { employeeNo } = await hire(`Leaver ${name}`, joinedOn);
    if (step) await changePerson(hr, { employeeNo, effectiveOn: step, fte: 0.5 });
    await recordLeaver(hr, { employeeNo, leftOn });
    expect((await periods(employeeNo)).map((p) => [p.startsOn, p.endsOn])).toEqual(left);
  });

  it("statuses follow the dates: the daily job starts joiners and moves future leavers to left, and is safe to re-run", async () => {
    expect(manifest.jobs?.map((j) => [j.name, j.cron])).toEqual([["hr.person.status", "5 0 * * *"]]);
    const joiner = await hire("Dated Joiner", "2027-01-04");
    const leaver = await hire("Dated Leaver", "2026-01-05");
    await recordLeaver(hr, { employeeNo: leaver.employeeNo, leftOn: "2027-01-08" });
    const status = async (no: string) => db.tx(async (tx) => (await getPerson(tx, sys(), no))!.status);
    expect([await status(joiner.employeeNo), await status(leaver.employeeNo)]).toEqual(["joining", "active"]);
    const job = contextFor.job(db.maya.tenantId, "hr.person.status");
    const first = await applyStatusDates(job, { on: "2027-01-10" });
    expect(first.started).toContain(joiner.employeeNo);
    expect(first.left).toContain(leaver.employeeNo);
    expect([await status(joiner.employeeNo), await status(leaver.employeeNo)]).toEqual(["active", "left"]);
    expect(await applyStatusDates(job, { on: "2027-01-10" })).toMatchObject({ started: [], left: [] });
    await expect(applyStatusDates(hr, { on: "2027-01-10" })).rejects.toThrow(/forbidden/);
  });

  it.each([
    { fields: { title: "Lead" }, effectiveOn: "2027-01-01", ok: false },
    { fields: { location: "Kandy" }, effectiveOn: "2026-01-01", ok: false },
    { fields: { title: "Lead", grade: "E3" }, effectiveOn: "2027-01-01", ok: false },
    { fields: { title: "Lead", workEmail: "lead@example.dev" }, effectiveOn: undefined, ok: true },
  ])("person fields change today only: $fields at $effectiveOn", async ({ fields, effectiveOn, ok }) => {
    const { employeeNo } = await hire(`Fields ${Object.keys(fields).join(" ")} ${effectiveOn ?? "now"}`);
    const run = changePerson(hr, { employeeNo, effectiveOn, ...fields });
    if (ok) await expect(run).resolves.toMatchObject({ changed: Object.keys(fields) });
    else await expect(run).rejects.toThrow(/change today/);
  });

  it("entities resolve to exactly one: no partial or wildcard match, and a shared country is ambiguous", async () => {
    const rollback = new Error("rollback");
    await db.tx(async (tx) => {
      const [lk] = await tx.execute(sql`select id, name from core.legal_entity where country = 'LK'`);
      for (const ok of ["Sri Lanka", "LK", "lk", lk.name as string, ` ${(lk.name as string).toUpperCase()} `, lk.id as string]) expect((await entityOf(tx, ok)).id).toBe(lk.id);
      for (const bad of ["Lumen", "%", "L_", "Lanka"]) await expect(entityOf(tx, bad)).rejects.toThrow(/no legal entity/);
      await tx.execute(sql`insert into core.legal_entity (tenant_id, name, country, base_currency) values (${db.maya.tenantId}, 'Lumen Labs Kandy', 'LK', 'LKR')`);
      await expect(entityOf(tx, "Sri Lanka")).rejects.toThrow(/matches 2 legal entities/);
      expect((await entityOf(tx, lk.name as string)).id).toBe(lk.id);
      throw rollback;
    }).catch((e) => { if (e !== rollback) throw e; });
  });

  it("two concurrent adds get two distinct, consecutive employee numbers", async () => {
    const [a, b] = await Promise.all([hire("Race One"), hire("Race Two")]);
    const n = [a.employeeNo, b.employeeNo].map((no) => Number(no.split("-")[1])).sort((x, y) => x - y);
    expect(n[1] - n[0]).toBe(1);
  });

  it.each([
    { kind: "service", viewer: false, ok: false },
    { kind: "agent", viewer: false, ok: false },
    { kind: "user", viewer: false, ok: false },
    { kind: "system", viewer: false, ok: true },
    { kind: "user", viewer: true, ok: true },
  ] as const)("HR writes fail closed without a viewer: $kind (viewer: $viewer)", ({ kind, viewer, ok }) => {
    const ctx = { tenantId: db.maya.tenantId, actor: { id: `${kind}:x`, kind }, source: "api", viewer: viewer ? db.mayaAs("HR") : undefined } as ServiceContext;
    const lk = "11111111-1111-4111-8111-1111111111a1";
    if (ok) expect(() => inScope(ctx, "hr:person:update", lk)).not.toThrow();
    else expect(() => inScope(ctx, "hr:person:update", lk)).toThrow(/forbidden/);
  });

  it("a fixed-term period boundary is not a contract end: only the last period's end counts", async () => {
    const before = (await peopleStats(db.mayaAs("HR"), TODAY)).contractsEndingNextMonth;
    const { employeeNo } = await hire("Fixed Term Stepper", "2026-01-05", { contract: "fixed-term" });
    await changePerson(hr, { employeeNo, effectiveOn: "2026-12-01", fte: 0.5 });
    expect((await peopleStats(db.mayaAs("HR"), TODAY)).contractsEndingNextMonth).toBe(before);
    const e = await db.tx(async (tx) => getEmployment(tx, (await getPerson(tx, sys(), employeeNo))!.id, db.mayaAs("HR"), "2026-11-15"));
    expect(e).toMatchObject({ endsOn: "2026-11-30", contractEndsOn: null });
  });

  it.each(["zz", "LK", "11111111-1111-4111-8111-1111111111a1"])("an unknown entity code in the URL is a 404: %s", async (code) => {
    await expect(PeoplePage({ params: { entity: code }, viewer: db.mayaAs("HR") } as never)).rejects.toThrow(/NEXT_HTTP_ERROR_FALLBACK;404|NEXT_NOT_FOUND/);
  });
});
