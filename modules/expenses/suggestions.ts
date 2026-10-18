import { sql } from "drizzle-orm";
import { z } from "zod";
import type { EventHandlerDef } from "@amax/core";
import { contextFor } from "@amax/core/server";
import { viewerOf } from "@amax/auth";
import { defineSuggestionKind } from "@amax/agents";
import { createSuggestion, SuggestionError } from "@amax/agents/server";
import { EVENTS as PAYROLL, type PayslipsSent } from "@amax/payroll/contracts";
import { CLAIM_SENSITIVE, EVENTS, type ReceiptAdded } from "./contracts";
import { ClaimInput, fileClaim } from "./server/claims";
import { receiptFields } from "./server/extract";
import { dueFor, PAYROLL_AGENT, payAll, unpay } from "./server/payroll";
import { money } from "./server/read";

const RECEIPT_AGENT = "Receipt agent";
const Proposed = ClaimInput.required({ receiptId: true }).omit({ payVia: true });

export const receiptClaim = defineSuggestionKind<z.infer<typeof Proposed>, { claimId: string }>({
  kind: "expenses.receipt-claim", title: "Expense claim from a receipt", permission: "expenses:claim", proposed: Proposed, fields: CLAIM_SENSITIVE,
  async apply(tx, ctx, p) {
    const [r] = await tx.execute(sql`select user_id from expenses.receipt where id = ${p.receiptId}`);
    if (!r || r.user_id !== viewerOf(ctx)?.userId) throw new SuggestionError("only the person who added the receipt may claim it");
    const out = await fileClaim(tx, ctx, p);
    return { applied: { claimId: out.result.claimId }, action: "expenses.claim.submit", resource: "expenses.claim", resourceId: out.resourceId, after: out.after, events: out.events };
  },
  async undo(tx, _ctx, _p, applied) {
    const [c] = await tx.execute(sql`update expenses.claim set status = 'withdrawn', updated_at = now() where id = ${applied.claimId} and manager_decided_by is null and status in ('submitted', 'manager_approved') returning number`);
    if (!c) throw new SuggestionError("that claim has been decided since, so it can't be withdrawn");
    return { applied: null, action: "expenses.claim.withdraw", resource: "expenses.claim", resourceId: applied.claimId, after: { status: "withdrawn", number: c.number } };
  },
});

export const receiptAgent: EventHandlerDef = {
  id: "expenses.receipt-agent", event: EVENTS.receiptAdded,
  async handle({ tx, tenantId, event }) {
    const e = event.payload as ReceiptAdded;
    const [r] = await tx.execute(sql`select r.filename, r.ocr_text, (select currency from expenses.category k where k.legal_entity_id = r.legal_entity_id limit 1) as currency
      from expenses.receipt r where r.id = ${e.receiptId}`);
    if (!r?.ocr_text) return;
    const read = await receiptFields(tenantId, String(r.ocr_text), String(r.currency ?? "USD"));
    if (!read) return;
    const f = read.fields;
    await createSuggestion(contextFor.job(tenantId, "expenses.receipt-agent"), {
      kind: receiptClaim.kind, target: { type: "expenses.receipt", id: e.receiptId, label: `Receipt ${r.filename as string}` },
      title: `Claim ${money(f.amount, f.currency)} at ${f.merchant}`, detail: `Read from the receipt you added (${read.by === "ai" ? "AI" : "text"}): ${f.category}, ${f.spentOn}. Accept to file the claim with your manager.`,
      proposed: { ...f, receiptId: e.receiptId, description: `${f.category[0].toUpperCase()}${f.category.slice(1)} at ${f.merchant}` },
      confidence: read.by === "ai" ? 0.7 : 0.85, agentName: RECEIPT_AGENT, scope: { ownerUserId: e.userId, legalEntityId: e.legalEntityId },
      evidence: [{ type: "record", label: `Receipt ${r.filename as string}`, ref: `/expenses?receipt=${e.receiptId}` }],
    });
  },
};

const Paid = z.object({ runId: z.uuid(), legalEntityId: z.uuid(), period: z.string().regex(/^\d{4}-\d{2}$/), claimIds: z.array(z.uuid()).min(1) });

export const payrollPaid = defineSuggestionKind<z.infer<typeof Paid>, { claimIds: string[] }>({
  kind: "expenses.payroll-paid", title: "Reimbursements paid in payroll", permission: "expenses:pay", proposed: Paid,
  async apply(tx, ctx, p) {
    const paid = await payAll(tx, ctx, p.claimIds, p.period);
    return { applied: { claimIds: p.claimIds }, action: "expenses.claim.pay", resource: "expenses.claim", after: { claimIds: p.claimIds, period: p.period, runId: p.runId },
      events: paid.map((x) => ({ name: EVENTS.claimPaid, payload: x.payload })) };
  },
  async undo(tx, _ctx, p, applied) {
    await unpay(tx, applied.claimIds, p.period);
    return { applied: null, action: "expenses.claim.unpay", resource: "expenses.claim", after: { claimIds: applied.claimIds, status: "approved" } };
  },
});

export const payrollAgent: EventHandlerDef = {
  id: "expenses.payroll-agent", event: PAYROLL.payslipsSent,
  async handle({ tx, tenantId, event }) {
    const e = event.payload as PayslipsSent;
    const { due, total } = await dueFor(tx, tenantId, e.legalEntityId, e.period);
    if (!due.length) return;
    await createSuggestion(contextFor.job(tenantId, "expenses.payroll-agent"), {
      kind: payrollPaid.kind, target: { type: "payroll.run", id: e.runId, label: `${e.period} pay run` },
      title: `Mark ${due.length} reimbursement${due.length === 1 ? "" : "s"} paid in the ${e.period} pay run`, detail: `Payslips for ${e.period} are out. ${due.map((d) => d.number).join(", ")} (${total}) were sent to this run; accept once they're on the payslips.`,
      proposed: { runId: e.runId, legalEntityId: e.legalEntityId, period: e.period, claimIds: due.map((d) => d.claimId) },
      confidence: 0.8, agentName: PAYROLL_AGENT, scope: { legalEntityId: e.legalEntityId }, evidence: [{ type: "record", label: "Expenses", ref: "/expenses" }],
    });
  },
};
