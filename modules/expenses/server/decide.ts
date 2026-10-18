import { sql } from "drizzle-orm";
import { z } from "zod";
import type { Tx } from "@amax/db";
import { can, ScopeError, viewerOf, type Viewer } from "@amax/auth";
import { defineService, type ServiceContext, type ServiceOutcome } from "@amax/core/server";
import { EVENTS, PAY_VIA, type ClaimStatus, type ClaimStepped, type PayVia } from "../contracts";
import { actorOf, loadClaim, ownerOf, payrollInstalled, thisMonth, type Row } from "./read";

export type Step = "manager" | "finance";

/** The step this viewer may decide now: never their own claim, and Finance never re-approves a claim it approved as manager. */
export function stepFor(v: Viewer | undefined, row: Row): Step | null {
  const owner = ownerOf(row);
  if (!v || (owner && owner === v.userId)) return null;
  const entity = { legalEntityId: row.legal_entity_id as string };
  if (row.status === "submitted") return (owner && v.reports.includes(owner)) || can(v, "expenses:admin", entity) ? "manager" : null;
  if (row.status === "manager_approved" && can(v, "expenses:approve-finance", entity) && !String(row.manager_decided_by ?? "").includes(v.userId)) return "finance";
  return null;
}

export const stepped = (row: Row, status: ClaimStatus, by: string): ClaimStepped => ({
  claimId: row.id as string, number: row.number as string, userId: ownerOf(row), managerUserId: (row.manager_user_id as string | null) ?? null, legalEntityId: row.legal_entity_id as string, status, by,
});

async function payment(tx: Tx, row: Row, asked?: PayVia) {
  const payroll = await payrollInstalled(tx);
  const via = asked ?? (row.pay_via as PayVia | null) ?? (payroll ? "payroll" : "bank");
  if (via === "payroll" && !payroll) throw new Error("payroll isn't installed, so pay this claim by bank");
  return { via, period: via === "payroll" ? await thisMonth(tx) : null };
}

type Approved = { claimId: string; number: string; status: ClaimStatus; step: Step; payVia: PayVia | null; payrollPeriod: string | null };

async function approve(tx: Tx, ctx: ServiceContext, id: string, asked?: PayVia): Promise<ServiceOutcome<Approved>> {
  const row = await loadClaim(tx, id, true);
  const step = stepFor(viewerOf(ctx), row);
  if (!step) throw new ScopeError("expenses:approve");
  const by = actorOf(ctx);
  if (step === "manager") {
    await tx.execute(sql`update expenses.claim set status = 'manager_approved', manager_decided_by = ${by}, manager_decided_at = now(), updated_at = now() where id = ${id}`);
    return { result: { claimId: id, number: row.number as string, status: "manager_approved", step, payVia: null, payrollPeriod: null }, resourceId: id, before: { status: row.status }, after: { status: "manager_approved", step },
      events: [{ name: EVENTS.claimApproved, payload: stepped(row, "manager_approved", by) }] };
  }
  const pay = await payment(tx, row, asked);
  await tx.execute(sql`update expenses.claim set status = 'approved', finance_decided_by = ${by}, finance_decided_at = now(), pay_via = ${pay.via}, payroll_period = ${pay.period}, updated_at = now() where id = ${id}`);
  return { result: { claimId: id, number: row.number as string, status: "approved", step, payVia: pay.via, payrollPeriod: pay.period }, resourceId: id, before: { status: row.status },
    after: { status: "approved", step, payVia: pay.via, payrollPeriod: pay.period }, events: [{ name: EVENTS.claimApproved, payload: stepped(row, "approved", by) }] };
}

const ref = { claimId: z.uuid().describe("The claim's id, from list_expense_claims") };

export const approveExpense = defineService({
  scoped: true, name: "expenses.claim.approve", action: "expenses:approve", resource: "expenses.claim",
  input: z.object({ ...ref, payVia: z.enum(PAY_VIA).optional().describe("Finance step only: payroll (next pay run) or bank") }),
  run: (tx, a, ctx) => approve(tx, ctx, a.claimId, a.payVia),
});

export const rejectExpense = defineService({
  scoped: true, name: "expenses.claim.reject", action: "expenses:approve", resource: "expenses.claim",
  input: z.object({ ...ref, comment: z.string().trim().min(3, "say why it's rejected").max(1000) }),
  async run(tx, a, ctx) {
    const row = await loadClaim(tx, a.claimId, true);
    const step = stepFor(viewerOf(ctx), row);
    if (!step) throw new ScopeError("expenses:approve");
    const by = actorOf(ctx);
    const who = step === "manager" ? sql`manager_decided_by = ${by}, manager_decided_at = now()` : sql`finance_decided_by = ${by}, finance_decided_at = now()`;
    await tx.execute(sql`update expenses.claim set status = 'rejected', ${who}, decision_comment = ${a.comment}, updated_at = now() where id = ${a.claimId}`);
    return { result: { claimId: a.claimId, number: row.number as string, status: "rejected", step }, resourceId: a.claimId, before: { status: row.status }, after: { status: "rejected", step },
      events: [{ name: EVENTS.claimRejected, payload: stepped(row, "rejected", by) }] };
  },
});
