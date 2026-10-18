import { z } from "zod";
import type { McpToolDef, SearchHit } from "@amax/core";
import type { Viewer } from "@amax/auth";
import { CLAIM_SENSITIVE, STATUSES } from "./contracts";
import { categoryOf, claimOf } from "./pins";
import { getCategory, listCategories, setCategoryLimits } from "./server/categories";
import { claimExpense } from "./server/claims";
import { approveExpense, rejectExpense } from "./server/decide";
import { getClaim, listClaims } from "./server/detail";
import { recordExpensePayment } from "./server/pay";
import { ctxFor } from "./server/read";
import { addReceipt } from "./server/receipts";
import { getExpenses } from "./server/view";

type Src = "mcp" | "chat";
const tool = <I extends z.ZodType>(t: Omit<McpToolDef, "input" | "run"> & { input: I; run: (v: Viewer, input: z.infer<I>, source: Src) => Promise<unknown> }) => t as unknown as McpToolDef;
const read = { scope: "read" as const, readOnly: true, permission: "expenses:read", sensitive: CLAIM_SENSITIVE };
const write = (permission: string) => ({ scope: "write" as const, permission });
const pass = <A>(svc: (ctx: ReturnType<typeof ctxFor>, a: A) => Promise<unknown>) => (v: Viewer, a: A, s: Src = "mcp") => svc(ctxFor(v, s), a);

export const mcpTools: McpToolDef[] = [
  tool({ ...read, pin: "view", name: "get_expenses", description: "Expenses: the claims waiting for your decision (as the claimant's manager, then as Finance), every other claim you can see with its step and payment, and the categories with their limits. A medical claim's merchant and note show only to the claimant and HR.",
    input: z.object({}), run: (v) => getExpenses(v) }),
  tool({ ...read, pin: "view", name: "list_expense_claims", description: "Expense claims you can see (your own, your reports' and, for Finance, your entities'), newest first, optionally with one status.",
    input: z.object({ status: z.enum(STATUSES).optional() }), run: (v, a) => listClaims(v, a.status) }),
  tool({ ...read, pin: { id: "claimId", of: claimOf as never }, name: "get_expense_claim", description: "One expense claim: category, amount against the limit, who submitted and approved it at each step, how it is paid, and a short-lived link to its receipt.",
    input: z.object({ claimId: z.uuid() }), run: (v, a) => getClaim(v, a.claimId) }),
  tool({ ...read, pin: "view", name: "list_expense_categories", description: "Expense categories per legal entity with the most one claim may be and the amount over which a receipt is needed.",
    input: z.object({}), run: (v) => listCategories(v) }),
  tool({ ...read, pin: { id: "categoryId", of: categoryOf as never }, name: "get_expense_category", description: "One expense category with its claim limit and receipt threshold.",
    input: z.object({ categoryId: z.uuid() }), run: (v, a) => getCategory(v, a.categoryId) }),
  tool({ ...write("expenses:claim"), name: "add_receipt", description: "Add a receipt photo or PDF (base64) for your own claim. It is stored in file storage; the receipt agent reads it and suggests the claim's fields for you to accept.",
    input: addReceipt.spec.input, service: addReceipt, run: pass(addReceipt) }),
  tool({ ...write("expenses:claim"), name: "claim_expense", description: "Claim one of your own expenses. It goes to your manager, then Finance. A receipt is needed over the category's threshold; a claim over the category's limit is flagged to the approvers.",
    input: claimExpense.spec.input, service: claimExpense, run: pass(claimExpense) }),
  tool({ ...write("expenses:approve"), name: "approve_expense", description: "Approve an expense claim at your step: as the claimant's manager, or as Finance (then it is paid in the next payroll run, or by bank).",
    input: approveExpense.spec.input, service: approveExpense, run: pass(approveExpense) }),
  tool({ ...write("expenses:approve"), name: "reject_expense", description: "Reject an expense claim at your step, saying why.",
    input: rejectExpense.spec.input, service: rejectExpense, run: pass(rejectExpense) }),
  tool({ ...write("expenses:pay"), name: "record_expense_payment", description: "Finance records that an approved claim was paid, with the bank transfer's reference.",
    input: recordExpensePayment.spec.input, service: recordExpensePayment, run: pass(recordExpensePayment) }),
  tool({ ...write("expenses:policy"), name: "set_expense_limits", description: "Finance sets a category's limit per claim and the amount over which a receipt is needed.",
    input: setCategoryLimits.spec.input, service: setCategoryLimits, run: pass(setCategoryLimits) }),
];

export async function search(viewer: Viewer, query: string): Promise<SearchHit[]> {
  if (!/expense|claim|receipt|reimburs/i.test(query)) return [];
  return (await listClaims(viewer).catch(() => [])).slice(0, 10).map((c) => ({ type: "expense-claim", id: c.id, title: `${c.number} ${c.personName}`, url: "/expenses", summary: `${c.categoryName}, ${c.amountText}, ${c.statusLabel}` }));
}
