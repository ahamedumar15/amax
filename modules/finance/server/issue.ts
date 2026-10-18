import { sql } from "drizzle-orm";
import type { Tx } from "@amax/db";
import { addDays, amt } from "./read";
import { taxFor, type Treatment } from "./tax";

export type ContractRow = {
  id: string; legal_entity_id: string; project_id: string; client: string; kind: "fixed" | "tm" | "retainer"; currency: string; value: string;
  hourly_rate: string | null; monthly_fee: string | null; starts_on: string; payment_days: number; tax_treatment: Treatment; country: string; base_currency: string;
};

export async function lockContract(tx: Tx, id: string): Promise<ContractRow> {
  const [c] = await tx.execute(sql`select c.*, c.starts_on::text as starts_on, e.country, e.base_currency from finance.contract c
    join core.legal_entity e on e.id = c.legal_entity_id where c.id = ${id} for update of c`);
  if (!c) throw new Error("no such contract");
  return c as unknown as ContractRow;
}

export async function rateOf(tx: Tx, from: string, to: string, on: string): Promise<string> {
  if (from === to) return "1";
  const [r] = await tx.execute(sql`select rate from finance.fx_rate where from_currency = ${from} and to_currency = ${to} and as_of <= ${on} order by as_of desc limit 1`);
  if (!r) throw new Error(`no stored ${from} to ${to} rate on or before ${on}; add one with set_fx_rate`);
  return String(r.rate);
}

async function nextNumber(tx: Tx, credit: boolean) {
  const prefix = credit ? "CN-" : "INV-";
  const [r] = await tx.execute(sql`select coalesce(max(substring(number from ${prefix.length + 1}::int)::int), 0) + 1 as n from finance.invoice where number like ${`${prefix}%`}`);
  return `${prefix}${String(r.n).padStart(4, "0")}`;
}

export type NewInvoice = {
  source: "tm" | "milestone" | "retainer" | "credit"; description: string; subtotal: string; issuedOn: string; by: string;
  hours?: string | null; period?: string | null; milestoneId?: string | null; creditsId?: string | null; number?: string;
};

export async function writeInvoice(tx: Tx, tenantId: string, c: ContractRow, n: NewInvoice) {
  const credit = Boolean(n.creditsId);
  const t = taxFor(c.country, c.tax_treatment, n.subtotal);
  const rate = await rateOf(tx, c.currency, c.base_currency, n.issuedOn);
  const number = n.number ?? (await nextNumber(tx, credit));
  const dueOn = addDays(n.issuedOn, credit ? 0 : c.payment_days);
  const [row] = await tx.execute(sql`insert into finance.invoice (tenant_id, contract_id, legal_entity_id, number, kind, source, credits_id, period, milestone_id, description, hours,
      currency, subtotal, tax, total, tax_lines, fx_rate, base_currency, base_subtotal, issued_on, due_on, issued_by)
    values (${tenantId}, ${c.id}, ${c.legal_entity_id}, ${number}, ${credit ? "credit_note" : "invoice"}, ${n.source}, ${n.creditsId ?? null}, ${n.period ?? null}, ${n.milestoneId ?? null},
      ${n.description}, ${n.hours ?? null}, ${c.currency}, ${n.subtotal}, ${t.tax}, ${t.total}, ${JSON.stringify(t.lines)}::jsonb, ${rate}, ${c.base_currency},
      round(${n.subtotal}::numeric * ${rate}::numeric, 4), ${n.issuedOn}, ${dueOn}, ${n.by}) returning id, base_subtotal`);
  return { id: row.id as string, number, subtotal: amt(n.subtotal), tax: t.tax, total: t.total, taxLines: t.lines, currency: c.currency, dueOn, baseCurrency: c.base_currency, baseSubtotal: amt(row.base_subtotal), fxRate: rate };
}
