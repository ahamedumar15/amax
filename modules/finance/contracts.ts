import { sql } from "drizzle-orm";
import type { Tx } from "@amax/db";
import { can, type Viewer } from "@amax/auth";
import { isSystemContext, type ServiceContext } from "@amax/core/server";

export const CONTRACT_KINDS = ["fixed", "tm", "retainer"] as const;
export type ContractKind = (typeof CONTRACT_KINDS)[number];
export const KIND_LABELS: Record<ContractKind, string> = { fixed: "Fixed price", tm: "Time and materials", retainer: "Retainer" };

export const EVENTS = {
  contractCreated: "finance.contract.created",
  invoiceDrafted: "finance.invoice.drafted",
  invoiceIssued: "finance.invoice.issued",
  creditNoteIssued: "finance.credit-note.issued",
  paymentRecorded: "finance.payment.recorded",
} as const;

export type ContractCreated = { contractId: string; projectId: string; legalEntityId: string; kind: ContractKind; by: string };
export type InvoiceDrafted = { draftId: string; contractId: string; legalEntityId: string; source: "tm" | "milestone" };
export type InvoiceIssued = { invoiceId: string; number: string; contractId: string; projectId: string; legalEntityId: string; source: string; by: string };
export type CreditNoteIssued = InvoiceIssued & { creditsId: string };
export type PaymentRecorded = { paymentId: string; invoiceId: string; contractId: string; legalEntityId: string; by: string };

export type ContractRef = { id: string; projectId: string; legalEntityId: string; kind: ContractKind; currency: string; value: string; invoiced: string; open: string };

type Reader = Viewer | ServiceContext;
const mayRead = (r: Reader, legalEntityId: string) =>
  "actor" in r ? (r.viewer ? can(r.viewer as Viewer, "finance:read", { legalEntityId }) : isSystemContext(r)) : can(r, "finance:read", { legalEntityId });

export async function listContractRefs(tx: Tx, reader: Reader): Promise<ContractRef[]> {
  const rows = await tx.execute(sql`select c.id, c.project_id, c.legal_entity_id, c.kind, c.currency, round(c.value, 2)::text as value,
      round(coalesce((select sum(i.subtotal) from finance.invoice i where i.contract_id = c.id), 0), 2)::text as invoiced,
      round(coalesce((select sum(i.total) from finance.invoice i where i.contract_id = c.id), 0) - coalesce((select sum(p.amount) from finance.payment p join finance.invoice i on i.id = p.invoice_id where i.contract_id = c.id), 0), 2)::text as open
    from finance.contract c order by c.created_at`);
  return rows.filter((r) => mayRead(reader, r.legal_entity_id as string)).map((r) => ({
    id: r.id as string, projectId: r.project_id as string, legalEntityId: r.legal_entity_id as string, kind: r.kind as ContractKind,
    currency: String(r.currency), value: String(r.value), invoiced: String(r.invoiced), open: String(r.open),
  }));
}

export type ReadyLine = { draftId: string; contractId: string; projectId: string; description: string; amount: string };
export type ReadyToInvoice = { currency: string; total: string; lines: ReadyLine[] };

/** 068 AC-1: open invoice drafts the reader may see, per currency, largest total first; lines largest first. */
export async function readyToInvoice(tx: Tx, reader: Reader): Promise<ReadyToInvoice[]> {
  const rows = await tx.execute(sql`select d.id, d.contract_id, c.project_id, c.legal_entity_id, c.currency, d.description, round(d.amount, 2)::text as amount
    from finance.draft d join finance.contract c on c.id = d.contract_id where d.status = 'open' order by d.amount desc`);
  const by = new Map<string, ReadyToInvoice>();
  for (const r of rows.filter((x) => mayRead(reader, x.legal_entity_id as string))) {
    const currency = String(r.currency);
    const g = by.get(currency) ?? { currency, total: "0", lines: [] };
    g.lines.push({ draftId: r.id as string, contractId: r.contract_id as string, projectId: r.project_id as string, description: r.description as string, amount: String(r.amount) });
    g.total = (Number(g.total) + Number(r.amount)).toFixed(2);
    by.set(currency, g);
  }
  return [...by.values()].sort((a, b) => Number(b.total) - Number(a.total));
}
