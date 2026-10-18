// The only import surface for other modules (docs/module-standard.md). Reads run in the caller's
// tenant transaction. A viewer sees claims they made, their reports' claims and, with
// expenses:review, every claim in the entity; trusted system code sees all of them.
import { sql } from "drizzle-orm";
import type { Tx } from "@amax/db";
import { can, ScopeError, type Viewer } from "@amax/auth";
import { isSystemContext, type ServiceContext } from "@amax/core/server";

export const STATUSES = ["submitted", "manager_approved", "approved", "rejected", "paid", "withdrawn"] as const;
export type ClaimStatus = (typeof STATUSES)[number];
export const STATUS_LABELS: Record<ClaimStatus, string> = {
  submitted: "With manager", manager_approved: "With Finance", approved: "Approved, to pay", rejected: "Rejected", paid: "Paid", withdrawn: "Withdrawn",
};
export const PAY_VIA = ["payroll", "bank"] as const;
export type PayVia = (typeof PAY_VIA)[number];

/** 002 classes: a medical claim's merchant and note are health data, for the claimant and HR only. */
export const CLAIM_SENSITIVE = { merchant: "health", description: "health" } as const;

export const EVENTS = {
  receiptAdded: "expenses.receipt.added",
  claimSubmitted: "expenses.claim.submitted",
  claimApproved: "expenses.claim.approved",
  claimRejected: "expenses.claim.rejected",
  claimPaid: "expenses.claim.paid",
} as const;

export type ReceiptAdded = { receiptId: string; userId: string; legalEntityId: string };
/** `step`: which approval was made; never an amount or a merchant, so nothing personal leaves in the outbox. */
export type ClaimStepped = { claimId: string; number: string; userId: string | null; managerUserId: string | null; legalEntityId: string; status: ClaimStatus; by: string };
export type ClaimPaid = ClaimStepped & { payVia: PayVia };

export type ClaimRef = { id: string; number: string; personId: string; userId: string | null; legalEntityId: string; category: string; spentOn: string; amount: string; currency: string; status: ClaimStatus; payVia: PayVia | null };
export type Reimbursement = { claimId: string; number: string; personId: string; userId: string | null; amount: string; currency: string };

type Reader = Viewer | ServiceContext;
function viewerOrSystem(r: Reader): Viewer | null {
  if (!("actor" in r)) return r;
  if (r.viewer) return r.viewer as Viewer;
  if (isSystemContext(r)) return null;
  throw new ScopeError("expenses:read");
}
const visible = (v: Viewer | null, row: Record<string, unknown>) => {
  if (!v) return true;
  const owner = row.user_id as string | null;
  return (!!owner && (owner === v.userId || v.reports.includes(owner))) || can(v, "expenses:review", { legalEntityId: row.legal_entity_id as string });
};

const toRef = (r: Record<string, unknown>): ClaimRef => ({
  id: r.id as string, number: r.number as string, personId: r.person_id as string, userId: (r.user_id as string | null) ?? null, legalEntityId: r.legal_entity_id as string,
  category: r.category as string, spentOn: String(r.spent_on), amount: String(r.amount), currency: String(r.currency), status: r.status as ClaimStatus, payVia: (r.pay_via as PayVia | null) ?? null,
});

/** Claims the reader may see, newest first; optionally only one person's (an hr.person id). */
export async function listClaimRefs(tx: Tx, reader: Reader, personId?: string): Promise<ClaimRef[]> {
  const v = viewerOrSystem(reader);
  const rows = await tx.execute(sql`select c.id, c.number, c.person_id, c.user_id, c.legal_entity_id, k.key as category, c.spent_on::text as spent_on,
      round(c.amount, 2)::text as amount, c.currency, c.status, c.pay_via from expenses.claim c join expenses.category k on k.id = c.category_id
    ${personId ? sql`where c.person_id = ${personId}` : sql``} order by c.created_at desc`);
  return rows.filter((r) => visible(v, r)).map(toRef);
}

/** Approved claims Finance sent to payroll for one entity's pay period (YYYY-MM): what payroll adds to net pay. System code and expenses:review only. */
export async function reimbursementsDue(tx: Tx, reader: Reader, scope: { legalEntityId: string; period: string }): Promise<Reimbursement[]> {
  const v = viewerOrSystem(reader);
  if (v && !can(v, "expenses:review", { legalEntityId: scope.legalEntityId })) return [];
  const rows = await tx.execute(sql`select id, number, person_id, user_id, round(amount, 2)::text as amount, currency from expenses.claim
    where status = 'approved' and pay_via = 'payroll' and legal_entity_id = ${scope.legalEntityId} and payroll_period = ${scope.period} order by number`);
  return rows.map((r) => ({ claimId: r.id as string, number: r.number as string, personId: r.person_id as string, userId: (r.user_id as string | null) ?? null, amount: String(r.amount), currency: String(r.currency) }));
}
