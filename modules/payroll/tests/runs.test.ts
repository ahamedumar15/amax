import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { hasDb, tablesMissingRls } from "@amax/db/testdb";
import { acceptSuggestion } from "@amax/agents/server";
import { ctxFor } from "../server/read";
import { payrollDb } from "./db";

describe.skipIf(!hasDb)("payroll runs (Postgres)", () => {
  let db: Awaited<ReturnType<typeof payrollDb>>;
  beforeAll(async () => { db = await payrollDb(); }, 120_000);
  afterAll(() => db?.t.drop());

  it("AC-1 a run steps Draft → Agent check → HR approval → Finance approval → Bank file → Payslips sent, each step audited; Finance approves totals only; the bank file needs two people", async () => {
    expect((await tablesMissingRls(db.t.owner)).filter((t) => t.startsWith("payroll."))).toEqual([]);
    const [payroll, payroll2, hr, finance] = [await db.as("maya", "Payroll"), await db.as("sahan", "Payroll"), await db.as("maya", "HR"), await db.as("maya", "Finance")];
    const call = (v: typeof hr, tool: string, args: object) => db.registry.call(v, tool, args, { source: "mcp" }) as Promise<Record<string, unknown>>;
    const [group] = await db.q(sql`select id from payroll.pay_group`);
    const drafted = await call(payroll, "draft_payroll_run", { payGroupId: group.id, period: "2026-10" });
    expect(drafted).toMatchObject({ status: "draft", payslips: 8 });
    const runId = drafted.runId as string;
    expect(await call(payroll, "check_payroll_run", { runId })).toMatchObject({ status: "checked", changes: 4 });
    await db.tick();
    const open = await db.q(sql`select id from agents.suggestion where kind = 'payroll.variance' and status = 'open'`);
    expect(open).toHaveLength(4);
    for (const s of open) await acceptSuggestion(ctxFor(hr), { id: s.id as string });
    expect(await call(hr, "approve_payroll_run_hr", { runId })).toMatchObject({ status: "hr_approved" });

    const fin = await call(finance, "approve_payroll_run_finance", { runId });
    expect(fin).toMatchObject({ status: "finance_approved", totals: { people: 8 } });
    expect(JSON.stringify(fin)).not.toMatch(/Ayesha|Nimal|payslip/i);
    expect((fin.costCentres as { people: number }[]).every((c) => c.people >= 3)).toBe(true);

    await db.tick();
    const [bank] = await db.q(sql`select id from agents.suggestion where kind = 'payroll.bank-file' and target_id = ${runId}`);
    expect(await acceptSuggestion(ctxFor(payroll), { id: bank.id as string })).toMatchObject({ status: "approved" });
    await expect(acceptSuggestion(ctxFor(payroll), { id: bank.id as string })).rejects.toThrow(/second, different person/);
    expect(await acceptSuggestion(ctxFor(payroll2), { id: bank.id as string })).toMatchObject({ status: "accepted" });
    expect(await db.q(sql`select rows from payroll.bank_file where run_id = ${runId}`)).toEqual([{ rows: 8 }]);
    expect(await call(payroll, "send_payslips", { runId })).toMatchObject({ status: "payslips_sent", payslips: 8 });

    const audit = await db.q(sql`select action from core.audit_event where resource_id = ${runId} and action like 'payroll.%' order by seq`);
    expect(audit.map((a) => a.action)).toEqual(["payroll.run.draft", "payroll.run.check", "payroll.run.approve-hr", "payroll.run.approve-finance", "payroll.run.bank-file", "payroll.payslips.send"]);
  }, 120_000);
});
