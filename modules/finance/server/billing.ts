import { sql } from "drizzle-orm";
import { z } from "zod";
import type { Tx } from "@amax/db";
import { defineService, type ServiceContext } from "@amax/core/server";
import { EVENTS, type CreditNoteIssued, type InvoiceIssued, type PaymentRecorded } from "../contracts";
import { lockContract, writeInvoice, type ContractRow } from "./issue";
import { actorOf, amt, mayAct, monthLabel, todayOf } from "./read";

const money = z.string().regex(/^\d+(\.\d{1,2})?$/, "an amount like 1200 or 1200.50");

export const issued = (inv: { id: string; number: string }, c: ContractRow, source: string, by: string): InvoiceIssued =>
  ({ invoiceId: inv.id, number: inv.number, contractId: c.id, projectId: c.project_id, legalEntityId: c.legal_entity_id, source, by });

const exceeds = async (tx: Tx, a: string, b: unknown) => Boolean((await tx.execute(sql`select ${a}::numeric > ${String(b)}::numeric as over`))[0].over);

async function lockInvoice(tx: Tx, ctx: ServiceContext, id: string, action: string) {
  const [i] = await tx.execute(sql`select i.*, i.total - coalesce((select sum(p.amount) from finance.payment p where p.invoice_id = i.id), 0)
      + coalesce((select sum(x.total) from finance.invoice x where x.credits_id = i.id), 0) as open,
      i.subtotal + coalesce((select sum(x.subtotal) from finance.invoice x where x.credits_id = i.id), 0) as creditable
    from finance.invoice i where i.id = ${id} and i.kind = 'invoice' for update`);
  if (!i) throw new Error("no such invoice");
  const c = await lockContract(tx, i.contract_id as string);
  mayAct(ctx, action, c.legal_entity_id);
  return { i, c };
}

export const invoiceRetainer = defineService({
  scoped: true,
  name: "finance.invoice.retainer",
  action: "finance:invoice:issue",
  resource: "finance.invoice",
  input: z.object({ contractId: z.uuid(), month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/).describe("The month, e.g. 2026-10") }),
  async run(tx, a, ctx) {
    const c = await lockContract(tx, a.contractId);
    mayAct(ctx, "finance:invoice:issue", c.legal_entity_id);
    if (c.kind !== "retainer") throw new Error("only a retainer is invoiced by the month");
    if (a.month < c.starts_on.slice(0, 7)) throw new Error(`the retainer starts in ${monthLabel(c.starts_on)}`);
    const [had] = await tx.execute(sql`select number from finance.invoice where contract_id = ${c.id} and source = 'retainer' and period = ${a.month} and kind = 'invoice'`);
    if (had) throw new Error(`${monthLabel(a.month)} is already invoiced as ${had.number as string}`);
    const [t] = await tx.execute(sql`select coalesce(sum(subtotal), 0) + ${c.monthly_fee}::numeric > ${c.value}::numeric as over from finance.invoice where contract_id = ${c.id}`);
    if (t.over) throw new Error("that would invoice more than the retainer's total");
    const by = actorOf(ctx);
    const inv = await writeInvoice(tx, ctx.tenantId, c, { source: "retainer", description: `${monthLabel(a.month)} retainer`, subtotal: c.monthly_fee!, period: a.month, issuedOn: await todayOf(tx), by });
    return { result: inv, resourceId: inv.id, after: { number: inv.number, subtotal: inv.subtotal }, events: [{ name: EVENTS.invoiceIssued, payload: issued(inv, c, "retainer", by) }] };
  },
});

export const recordPayment = defineService({
  scoped: true,
  name: "finance.payment.record",
  action: "finance:payment:record",
  resource: "finance.invoice",
  input: z.object({ invoiceId: z.uuid(), amount: money, receivedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), reference: z.string().optional() }),
  async run(tx, a, ctx) {
    const { i, c } = await lockInvoice(tx, ctx, a.invoiceId, "finance:payment:record");
    if (await exceeds(tx, a.amount, i.open)) throw new Error(`${i.number as string} has ${amt(i.open)} ${c.currency} open`);
    const by = actorOf(ctx);
    const [p] = await tx.execute(sql`insert into finance.payment (tenant_id, invoice_id, amount, currency, received_on, reference, recorded_by)
      values (${ctx.tenantId}, ${i.id}, ${a.amount}, ${c.currency}, ${a.receivedOn}, ${a.reference ?? null}, ${by}) returning id, ${String(i.open)}::numeric - amount as open`);
    const payload: PaymentRecorded = { paymentId: p.id as string, invoiceId: i.id as string, contractId: c.id, legalEntityId: c.legal_entity_id, by };
    return { result: { paymentId: p.id as string, open: amt(p.open) }, resourceId: i.id as string, after: a, events: [{ name: EVENTS.paymentRecorded, payload }] };
  },
});

export const issueCreditNote = defineService({
  scoped: true,
  name: "finance.credit-note.issue",
  action: "finance:invoice:issue",
  resource: "finance.invoice",
  input: z.object({ invoiceId: z.uuid(), amount: money.describe("The amount credited before tax"), reason: z.string().min(3) }),
  async run(tx, a, ctx) {
    const { i, c } = await lockInvoice(tx, ctx, a.invoiceId, "finance:invoice:issue");
    if (await exceeds(tx, a.amount, i.creditable)) throw new Error(`${i.number as string} has only ${amt(i.creditable)} ${c.currency} left to credit`);
    const by = actorOf(ctx);
    const cn = await writeInvoice(tx, ctx.tenantId, c, { source: "credit", description: `Credit for ${i.number as string}: ${a.reason}`, subtotal: `-${a.amount}`, creditsId: i.id as string, period: i.period as string | null, issuedOn: await todayOf(tx), by });
    const payload: CreditNoteIssued = { ...issued(cn, c, "credit", by), creditsId: i.id as string };
    return { result: cn, resourceId: cn.id, after: { number: cn.number, credits: i.number, subtotal: cn.subtotal }, events: [{ name: EVENTS.creditNoteIssued, payload }] };
  },
});
