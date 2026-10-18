import { z } from "zod";
import type { McpToolDef, SearchHit } from "@amax/core";
import type { Viewer } from "@amax/auth";
import { contractOf, invoiceOf } from "./pins";
import { invoiceRetainer, issueCreditNote, recordPayment } from "./server/billing";
import { getContract, getInvoice, listContracts } from "./server/detail";
import { ctxFor } from "./server/read";
import { addMilestone, createContract, setFxRate } from "./server/setup";
import { getFinancials } from "./server/view";

type Src = "mcp" | "chat";
const tool = <I extends z.ZodType>(t: Omit<McpToolDef, "input" | "run"> & { input: I; run: (v: Viewer, input: z.infer<I>, source: Src) => Promise<unknown> }) => t as unknown as McpToolDef;
const read = { scope: "read" as const, readOnly: true, permission: "finance:read" };
const write = (permission: string) => ({ scope: "write" as const, permission });
const pass = <A>(svc: (ctx: ReturnType<typeof ctxFor>, a: A) => Promise<unknown>) => (v: Viewer, a: A, s: Src = "mcp") => svc(ctxFor(v, s), a);

export const mcpTools: McpToolDef[] = [
  tool({ ...read, pin: "view", name: "get_financials", description: "Financials: contract value, invoiced to date, overdue, invoiced per month against target, receivables by age, and every contract with its next invoice and payments. Totals are in the reporting currency at stored rates; byEntity gives invoiced in each entity's base currency.",
    input: z.object({}), run: (v) => getFinancials(v) }),
  tool({ ...read, pin: "view", name: "list_contracts", description: "Contracts per project: fixed price, time and materials with a cap, or retainer, with invoiced so far, the next invoice and any overdue invoice.",
    input: z.object({}), run: (v) => listContracts(v) }),
  tool({ ...read, pin: { id: "contractId", of: contractOf as never }, name: "get_contract", description: "One contract with its milestones and every invoice and credit note (tax lines, base-currency amount at the stored rate, paid and open).",
    input: z.object({ contractId: z.uuid() }), run: (v, a) => getContract(v, a.contractId) }),
  tool({ ...read, pin: { id: "invoiceId", of: invoiceOf as never }, name: "get_invoice", description: "One invoice or credit note: lines, tax per entity, payments and what is still open.",
    input: z.object({ invoiceId: z.uuid() }), run: (v, a) => getInvoice(v, a.invoiceId) }),
  tool({ ...write("finance:contract:write"), name: "create_contract", description: "Create a project's contract: fixed price (then add milestones), time and materials (hourly rate, value is the cap) or retainer (monthly fee, value is the total). Tax follows the billing entity unless it's an export.",
    input: createContract.spec.input, service: createContract, run: pass(createContract) }),
  tool({ ...write("finance:contract:write"), name: "add_contract_milestone", description: "Add a milestone to a fixed-price contract. With a release version, the billing agent drafts its invoice when that release reaches Prod.",
    input: addMilestone.spec.input, service: addMilestone, run: pass(addMilestone) }),
  tool({ ...write("finance:contract:write"), name: "set_fx_rate", description: "Store an exchange rate (from one currency to another, as of a day) used to convert totals and each invoice's base-currency amount.",
    input: setFxRate.spec.input, service: setFxRate, run: pass(setFxRate) }),
  tool({ ...write("finance:invoice:issue"), name: "invoice_retainer", description: "Issue a retainer's invoice for a month, with the billing entity's tax.",
    input: invoiceRetainer.spec.input, service: invoiceRetainer, run: pass(invoiceRetainer) }),
  tool({ ...write("finance:payment:record"), name: "record_payment", description: "Record a payment received against an invoice.",
    input: recordPayment.spec.input, service: recordPayment, run: pass(recordPayment) }),
  tool({ ...write("finance:invoice:issue"), name: "issue_credit_note", description: "Issue a credit note against an invoice for an amount before tax; tax is credited in proportion. It reduces invoiced and open amounts.",
    input: issueCreditNote.spec.input, service: issueCreditNote, run: pass(issueCreditNote) }),
];

export async function search(viewer: Viewer, query: string): Promise<SearchHit[]> {
  const q = query.toLowerCase();
  if (!/contract|invoice|financ|billing|receivable/.test(q)) return [];
  return (await listContracts(viewer).catch(() => [])).map((c) => ({ type: "finance-contract", id: c.id, title: `${c.projectName} contract`, url: `/finance`, summary: `${c.kindLabel}, ${c.next}` }));
}
