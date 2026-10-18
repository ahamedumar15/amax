import { sql } from "drizzle-orm";
import type { Tx } from "@amax/db";
import type { Viewer } from "@amax/auth";
import type { RunStatus } from "../contracts";
import type { PayLineKind } from "../packs";
import { amt, levelOf, monthLabel, read } from "./read";
import { packOf } from "./statutory";

export type PayslipView = {
  id: string; runId: string; personName: string; employeeNo: string; costCentre: string; period: string; periodLabel: string; currency: string; status: RunStatus;
  workingDays: number; daysPaid: number; gross: string; deductions: string; net: string; employer: string; flags: string[];
  lines: { label: string; kind: PayLineKind; amount: string; basis: string | null }[]; pack: string | null; own: boolean;
};

const SLIP = sql`select s.*, r.status, r.pack, to_char(r.period, 'YYYY-MM') as month from payroll.payslip s join payroll.run r on r.id = s.run_id`;

async function payslipRow(tx: Tx, v: Viewer, s: Record<string, unknown>): Promise<PayslipView | null> {
  const own = !!s.user_id && s.user_id === v.userId;
  // 014 AC-3: Payroll and Admin read any payslip; a person reads their own once it has been sent.
  if (levelOf(v, s.legal_entity_id as string) !== "pay" && !(own && s.status === "payslips_sent")) return null;
  const lines = await tx.execute(sql`select * from payroll.payslip_line where payslip_id = ${s.id} order by position`);
  return {
    id: s.id as string, runId: s.run_id as string, personName: s.person_name as string, employeeNo: s.employee_no as string, costCentre: s.cost_centre as string,
    period: s.month as string, periodLabel: monthLabel(s.month as string), currency: s.currency as string, status: s.status as RunStatus,
    workingDays: Number(s.working_days), daysPaid: Number(s.days_paid), gross: amt(s.gross), deductions: amt(s.deductions), net: amt(s.net), employer: amt(s.employer_cost), flags: (s.flags as string[]) ?? [],
    lines: lines.map((l) => ({ label: l.label as string, kind: l.kind as PayLineKind, amount: amt(l.amount), basis: (l.basis as string | null) ?? null })), pack: packOf(s.pack as string)?.label ?? null, own,
  };
}

/** One payslip with its lines: Payroll and Admin, or its person once sent. Null otherwise. */
export const getPayslip = (v: Viewer, payslipId: string) => read(v, async (tx) => {
  const [s] = await tx.execute(sql`${SLIP} where s.id = ${payslipId}`);
  return s ? payslipRow(tx, v, s) : null;
}, "payroll:payslip:read");

/** The viewer's own sent payslips, newest first. */
export const myPayslips = (v: Viewer) => read(v, async (tx) => {
  const rows = await tx.execute(sql`${SLIP} where s.user_id = ${v.userId} and r.status = 'payslips_sent' order by r.period desc`);
  const out: PayslipView[] = [];
  for (const s of rows) {
    const p = await payslipRow(tx, v, s);
    if (p) out.push(p);
  }
  return out;
}, "payroll:payslip:read");
