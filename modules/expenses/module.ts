import { declarePayload, defineModule } from "@amax/core";
import { chatIntents } from "./chat";
import { EVENTS, type ClaimPaid, type ClaimStepped, type ReceiptAdded } from "./contracts";
import { expensesFixtures } from "./fixtures";
import { mcpTools, search } from "./mcp";
import { payrollAgent, payrollPaid, receiptAgent, receiptClaim } from "./suggestions";
import { ExpensesPage } from "./ui/ExpensesPage";

const OWN = ["expenses:read", "expenses:claim", "expenses:approve"];
const FINANCE = [...OWN, "expenses:review", "expenses:approve-finance", "expenses:pay", "expenses:policy"];
const step = declarePayload<ClaimStepped>({ claimId: "plain", number: "plain", userId: "plain", managerUserId: "plain", legalEntityId: "plain", status: "plain", by: "plain" });

export default defineModule({
  id: "expenses",
  title: "Expenses",
  icon: "cash",
  group: "Business",
  order: 35,
  dependsOn: ["hr"],
  integratesWith: ["payroll"],
  permissions: [...FINANCE, "expenses:admin"],
  // Anyone may claim and approve their own reports' claims (the check is the hr reporting line);
  // Finance approves second, pays and sets the limits in its entities.
  grants: { Finance: FINANCE, Leadership: [...OWN, "expenses:review"], PM: OWN, Engineer: OWN, Sales: OWN, HR: OWN, Payroll: [...OWN, "expenses:review"], ITAdmin: OWN, Employee: OWN },
  routes: [{ path: "", title: "Expenses", component: ExpensesPage }],
  mcpTools,
  search: search as never,
  chatIntents,
  // Claims and receipts are tax records: kept seven years from the claim, then the people and merchants are anonymised.
  retention: [
    { table: "expenses.claim", label: "Expense claims", subject: ["person_id", "user_id", "submitted_by", "manager_decided_by", "finance_decided_by", "paid_by"], subjectName: ["person_name"], entity: "legal_entity_id",
      fields: ["person_name", "merchant", "description", "decision_comment", "submitted_by", "manager_decided_by", "finance_decided_by", "paid_by"], class: "personal", period: "P7Y", start: { at: ["created_at"] }, action: "anonymise" },
    { table: "expenses.receipt", label: "Receipts", subject: ["user_id", "uploaded_by"], entity: "legal_entity_id", fields: ["filename", "ocr_text", "uploaded_by"], class: "personal", period: "P7Y", start: { at: ["created_at"] }, action: "anonymise" },
  ],
  jobs: [],
  notifications: [
    { id: "expenses.submitted", event: EVENTS.claimSubmitted, when: { status: "submitted" }, category: "approvals", to: [{ approvers: "userId" }], permission: "expenses:approve", subject: "userId",
      title: "{userId|name} claimed an expense, {number}", href: "/expenses" },
    { id: "expenses.finance", event: EVENTS.claimApproved, when: { status: "manager_approved" }, category: "approvals", to: [{ role: "Finance" }], permission: "expenses:approve-finance",
      scope: { legalEntityId: "legalEntityId" }, except: "by", title: "{number} from {userId|name} is ready for Finance", href: "/expenses" },
    { id: "expenses.finance-direct", event: EVENTS.claimSubmitted, when: { status: "manager_approved" }, category: "approvals", to: [{ role: "Finance" }], permission: "expenses:approve-finance",
      scope: { legalEntityId: "legalEntityId" }, except: "by", title: "{number} from {userId|name} (no manager on record) is ready for Finance", href: "/expenses" },
    { id: "expenses.decided", event: EVENTS.claimApproved, when: { status: "approved" }, category: "approvals", to: [{ owner: "userId" }], except: "by", subject: "userId", title: "Your expense {number} was approved", href: "/expenses" },
    { id: "expenses.rejected", event: EVENTS.claimRejected, category: "approvals", to: [{ owner: "userId" }], except: "by", subject: "userId", title: "Your expense {number} was rejected", href: "/expenses" },
  ],
  events: {
    emits: Object.values(EVENTS),
    handles: [receiptAgent, payrollAgent],
    payloads: {
      [EVENTS.receiptAdded]: declarePayload<ReceiptAdded>({ receiptId: "plain", userId: "plain", legalEntityId: "plain" }),
      [EVENTS.claimSubmitted]: step,
      [EVENTS.claimApproved]: step,
      [EVENTS.claimRejected]: step,
      [EVENTS.claimPaid]: declarePayload<ClaimPaid>({ claimId: "plain", number: "plain", userId: "plain", managerUserId: "plain", legalEntityId: "plain", status: "plain", by: "plain", payVia: "plain" }),
    },
  },
  suggestions: [receiptClaim, payrollPaid],
  fixtures: [expensesFixtures],
});
