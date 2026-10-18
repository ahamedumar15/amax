import { sql } from "drizzle-orm";
import type { Tx } from "@amax/db";
import { contextFor, type ServiceContext } from "@amax/core/server";
import { reimbursementsDue } from "../contracts";
import { markPaid } from "./pay";
import { money } from "./read";

export const PAYROLL_AGENT = "Expenses agent";

/** What a payroll-paid suggestion proposes: the claims Finance sent to that pay run. */
export async function dueFor(tx: Tx, tenantId: string, legalEntityId: string, period: string) {
  const due = await reimbursementsDue(tx, contextFor.job(tenantId, "expenses.payroll-agent"), { legalEntityId, period });
  const totals = new Map<string, number>();
  for (const d of due) totals.set(d.currency, (totals.get(d.currency) ?? 0) + Number(d.amount));
  return { due, total: [...totals].map(([c, n]) => money(n, c)).join(" and ") };
}

export async function payAll(tx: Tx, ctx: ServiceContext, claimIds: string[], period: string) {
  const [d] = await tx.execute(sql`select current_date::text as today`);
  const out = [];
  for (const id of claimIds) out.push(await markPaid(tx, ctx, id, { on: String(d.today), reference: `Payroll ${period}`, via: "payroll" }));
  return out;
}

export async function unpay(tx: Tx, claimIds: string[], period: string) {
  for (const id of claimIds) {
    await tx.execute(sql`update expenses.claim set status = 'approved', paid_on = null, paid_reference = null, paid_by = null, updated_at = now()
      where id = ${id} and status = 'paid' and paid_reference = ${`Payroll ${period}`}`);
  }
}
