import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { hasDb } from "@amax/db/testdb";
import { acceptSuggestion } from "@amax/agents/server";
import { contextFor } from "@amax/core/server";
import { EVENTS as PAYROLL } from "@amax/payroll/contracts";
import { reimbursementsDue } from "../contracts";
import { ctxFor } from "../server/read";
import { expensesDb, T } from "./db";

const LK = "11111111-1111-4111-8111-1111111111a1";

describe.skipIf(!hasDb)("payment through payroll (Postgres)", () => {
  let db: Awaited<ReturnType<typeof expensesDb>>;
  beforeAll(async () => { db = await expensesDb(); await db.tick(); }, 120_000);
  afterAll(() => db?.t.drop());

  it("AC-1 Finance's approval queues the claim for this month's payroll; payslips sent suggests marking them paid, which Finance accepts", async () => {
    const [c] = await db.q(sql`select id from expenses.claim where number = 'EXP-0104'`);
    const ok = await db.call<{ payVia: string; payrollPeriod: string }>("sahan", "approve_expense", { claimId: c.id });
    expect(ok.payVia).toBe("payroll");
    const due = await db.tx((tx) => reimbursementsDue(tx, contextFor.job(T, "test"), { legalEntityId: LK, period: ok.payrollPeriod }));
    expect(due.map((d) => d.number)).toContain("EXP-0104");
    for (const period of new Set(["2026-10", ok.payrollPeriod])) {
      await db.q(sql`insert into core.event (tenant_id, name, payload) values (${T}, ${PAYROLL.payslipsSent}, ${JSON.stringify({ runId: crypto.randomUUID(), payGroupId: crypto.randomUUID(), legalEntityId: LK, period, status: "payslips_sent", by: "test", payslips: 6, userIds: [] })}::jsonb)`);
    }
    await db.tick();
    const open = await db.q(sql`select id, proposed from agents.suggestion where kind = 'expenses.payroll-paid' and status = 'open'`);
    expect(open.length).toBeGreaterThan(0);
    for (const s of open) expect(await acceptSuggestion(ctxFor(await db.as("sahan")), { id: s.id as string })).toMatchObject({ status: "accepted" });
    const paid = await db.q(sql`select number, status, pay_via, paid_reference from expenses.claim where number in ('EXP-0104', 'EXP-0105') order by number`);
    expect(paid.map((p) => [p.number, p.status, p.pay_via])).toEqual([["EXP-0104", "paid", "payroll"], ["EXP-0105", "paid", "payroll"]]);
  }, 60_000);
});
