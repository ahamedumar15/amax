import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { hasDb } from "@amax/db/testdb";
import { isMasked } from "@amax/auth";
import { getChange, getPayslip, getRun, listRuns, myPayslips } from "../server/queries";
import { payrollDb } from "./db";

describe.skipIf(!hasDb)("pay visibility (Postgres)", () => {
  let db: Awaited<ReturnType<typeof payrollDb>>;
  beforeAll(async () => { db = await payrollDb(); await db.tick(); }, 120_000);
  afterAll(() => db?.t.drop());

  it("AC-3 pay values go only to Payroll and Admin, and to an employee for their own sent payslip; Finance gets totals, HR the steps, others nothing", async () => {
    const [payroll, admin, finance, hr, nimal] = [await db.as("maya", "Payroll"), await db.as("sahan"), await db.as("maya", "Finance"), await db.as("maya", "HR"), await db.as("nimal")];
    const [oct, sep] = await listRuns(payroll);
    const full = (await getRun(payroll, oct.id))!;
    expect([full.level, full.payslips!.length, (await getRun(admin, oct.id))!.level]).toEqual(["pay", 8, "pay"]);
    const ayesha = full.payslips!.find((s) => s.personName === "Ayesha Rahman")!;
    expect((await getPayslip(payroll, ayesha.id))!.lines.length).toBeGreaterThan(0);

    const fin = (await getRun(finance, oct.id))!;
    expect([fin.level, fin.payslips, fin.changes, fin.money!.costCentres.every((c) => c.people >= 3)]).toEqual(["totals", undefined, undefined, true]);
    expect(JSON.stringify(fin)).not.toContain("Ayesha");
    expect([await getPayslip(finance, ayesha.id), await getChange(finance, full.changes![0].id)]).toEqual([null, null]);

    const status = (await getRun(hr, oct.id))!;
    expect([status.level, status.money, status.payslips]).toEqual(["status", undefined, undefined]);
    expect(status.changes!.every((c) => isMasked(c.amount) && isMasked(c.was) && isMasked(c.now) && c.explanation)).toBe(true);
    expect(await getPayslip(hr, ayesha.id)).toBeNull();

    await expect(getRun(nimal, oct.id)).rejects.toThrow(/payroll:read/);
    await expect(db.registry.call(nimal, "get_payroll_run", { runId: oct.id }, { source: "mcp" })).rejects.toThrow(/forbidden/);
    const mine = await myPayslips(nimal);
    expect(mine.map((s) => [s.personName, s.period, s.own])).toEqual([["Nimal Silva", sep.period, true]]);
    expect(await getPayslip(nimal, full.payslips!.find((s) => s.personName === "Nimal Silva")!.id)).toBeNull();
    expect(await getPayslip(nimal, ayesha.id)).toBeNull();
    const tools = db.modules.find((m) => m.id === "payroll")!.mcpTools!;
    expect(tools.filter((t) => t.scope === "read").every((t) => t.sensitive?.net === "pay" && t.sensitive?.gross === "pay")).toBe(true);
  }, 60_000);
});
