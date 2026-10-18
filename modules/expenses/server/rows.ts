import { mask, type Masked, type Viewer } from "@amax/auth";
import { CLAIM_SENSITIVE, STATUS_LABELS, type ClaimStatus, type PayVia } from "../contracts";
import { stepFor, type Step } from "./decide";
import { money, ownerOf, shortDay, type Row } from "./read";

export type ClaimView = {
  id: string; number: string; personName: string; mine: boolean; category: string; categoryName: string; spentOn: string; spentText: string;
  merchant: string | Masked; description: string | Masked; amount: string; currency: string; amountText: string; overLimit: boolean; limitText: string;
  status: ClaimStatus; statusLabel: string; tone: "good" | "warn" | "problem" | "info"; step: Step | null; payVia: PayVia | null; payText: string; receipt: string | null; comment: string | null;
};

const TONES: Record<ClaimStatus, ClaimView["tone"]> = { submitted: "info", manager_approved: "info", approved: "warn", rejected: "problem", paid: "good", withdrawn: "info" };
const monthName = (period: string) => new Date(`${period}-01T00:00:00Z`).toLocaleDateString("en-US", { month: "short", timeZone: "UTC" });

function payText(c: Row) {
  if (c.status === "paid") return `${c.pay_via === "payroll" ? "In payroll" : "By bank"}, ${shortDay(String(c.paid_on))}`;
  if (c.status === "approved") return c.pay_via === "payroll" ? `${monthName(String(c.payroll_period))} payroll` : "By bank, to pay";
  return c.pay_via ? `${c.pay_via === "payroll" ? "Payroll" : "Bank"} asked` : "Finance decides";
}

export function claimRow(v: Viewer, c: Row): ClaimView {
  const plain = { merchant: c.merchant as string, description: c.description as string };
  const shown = c.health ? mask(v, plain, CLAIM_SENSITIVE, { ownerUserId: ownerOf(c), legalEntityId: c.legal_entity_id as string }) : plain;
  const status = c.status as ClaimStatus;
  return {
    id: c.id as string, number: c.number as string, personName: c.person_name as string, mine: ownerOf(c) === v.userId, category: c.category_key as string, categoryName: c.category_name as string,
    spentOn: String(c.spent_on), spentText: shortDay(String(c.spent_on)), merchant: shown.merchant, description: shown.description, amount: String(c.amount), currency: String(c.currency),
    amountText: money(c.amount, String(c.currency)), overLimit: Boolean(c.over_limit), limitText: money(c.claim_limit, String(c.currency)),
    status, statusLabel: STATUS_LABELS[status], tone: c.over_limit && ["submitted", "manager_approved"].includes(status) ? "warn" : TONES[status],
    step: stepFor(v, c), payVia: (c.pay_via as PayVia | null) ?? null, payText: payText(c), receipt: (c.receipt_filename as string | null) ?? null, comment: (c.decision_comment as string | null) ?? null,
  };
}
