import { sql } from "drizzle-orm";
import type { Tx } from "@amax/db";
import type { Viewer } from "@amax/auth";
import { amt, read, sees } from "./read";
import { financialsIn } from "./view";

const INVOICES = sql`select i.id, i.number, i.kind, i.source, i.description, i.period, i.hours, i.currency, i.subtotal, i.tax, i.total, i.tax_lines, i.fx_rate, i.base_currency, i.base_subtotal,
    i.issued_on::text as issued_on, i.due_on::text as due_on, i.issued_by, i.contract_id, i.legal_entity_id, i.credits_id,
    coalesce((select sum(p.amount) from finance.payment p where p.invoice_id = i.id), 0) as paid,
    i.total - coalesce((select sum(p.amount) from finance.payment p where p.invoice_id = i.id), 0) + coalesce((select sum(x.total) from finance.invoice x where x.credits_id = i.id), 0) as open
  from finance.invoice i`;

export type InvoiceView = {
  id: string; number: string; kind: "invoice" | "credit_note"; source: string; description: string; period: string | null; hours: string | null; currency: string;
  subtotal: string; tax: string; total: string; taxLines: { label: string; amount: string }[]; paid: string; open: string; issuedOn: string; dueOn: string; issuedBy: string;
  base: { currency: string; subtotal: string; rate: string }; contractId: string; creditsId: string | null;
};

const toInvoice = (r: Record<string, unknown>): InvoiceView => ({
  id: r.id as string, number: r.number as string, kind: r.kind as InvoiceView["kind"], source: r.source as string, description: r.description as string, period: (r.period as string | null) ?? null,
  hours: r.hours === null ? null : amt(r.hours), currency: String(r.currency), subtotal: amt(r.subtotal), tax: amt(r.tax), total: amt(r.total),
  taxLines: (r.tax_lines as { label: string; amount: string }[]).map((t) => ({ label: t.label, amount: t.amount })), paid: amt(r.paid), open: r.kind === "invoice" ? amt(r.open) : "0.00",
  issuedOn: r.issued_on as string, dueOn: r.due_on as string, issuedBy: r.issued_by as string,
  base: { currency: String(r.base_currency), subtotal: amt(r.base_subtotal), rate: String(r.fx_rate) }, contractId: r.contract_id as string, creditsId: (r.credits_id as string | null) ?? null,
});

async function invoicesOf(tx: Tx, contractId: string) {
  return (await tx.execute(sql`${INVOICES} where i.contract_id = ${contractId} order by i.issued_on desc, i.number desc`)).map(toInvoice);
}

export const listContracts = (v: Viewer) => read(v, async (tx) => (await financialsIn(tx, v))?.contracts ?? []);

export const getContract = (v: Viewer, contractId: string) => read(v, async (tx) => {
  const f = await financialsIn(tx, v, sql`c.id = ${contractId}`);
  if (!f) return null;
  const milestones = await tx.execute(sql`select id, label, amount, release_version, status from finance.milestone where contract_id = ${contractId} order by position`);
  return { ...f.contracts[0], invoices: await invoicesOf(tx, contractId),
    milestones: milestones.map((m) => ({ id: m.id as string, label: m.label as string, amount: amt(m.amount), releaseVersion: (m.release_version as string | null) ?? null, status: m.status as string })) };
});

export const getInvoice = (v: Viewer, invoiceId: string) => read(v, async (tx) => {
  const [r] = await tx.execute(sql`${INVOICES} where i.id = ${invoiceId}`);
  if (!r || !sees(v, r.legal_entity_id as string)) return null;
  const payments = await tx.execute(sql`select amount, received_on::text as received_on, reference from finance.payment where invoice_id = ${invoiceId} order by received_on`);
  return { ...toInvoice(r), payments: payments.map((p) => ({ amount: amt(p.amount), receivedOn: p.received_on as string, reference: (p.reference as string | null) ?? null })) };
});
