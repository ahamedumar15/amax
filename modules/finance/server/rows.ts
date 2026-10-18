import { sql } from "drizzle-orm";
import type { Tx } from "@amax/db";
import { KIND_LABELS, type ContractKind } from "../contracts";
import { money, percent } from "./fmt";
import { amt, daysBetween, monthLabel } from "./read";
import { nextOf, paymentsOf, type Overdue } from "./status";

export type ContractView = {
  id: string; projectId: string; projectKey: string; projectName: string; client: string; legalEntityId: string; kind: ContractKind; kindLabel: string; terms: string;
  currency: string; value: string; invoiced: string; invoicedPct: number; next: string; draft: { id: string; amount: string } | null;
  payments: { tone: "good" | "bad"; text: string }; overdue: Overdue[];
};

export const CONTRACTS = sql`select c.*, c.starts_on::text as starts_on, c.renews_on::text as renews_on,
    round(coalesce((select sum(i.subtotal) from finance.invoice i where i.contract_id = c.id), 0), 2)::text as invoiced
  from finance.contract c`;

const termsOf = (c: Record<string, unknown>) => {
  const cur = String(c.currency);
  if (c.kind === "tm") return `${money(amt(c.hourly_rate), cur)} an hour, capped`;
  if (c.kind === "retainer") return `${money(amt(c.monthly_fee), cur)} a month from ${monthLabel(String(c.starts_on), "short")} ${Number(String(c.starts_on).slice(8, 10))}`;
  return c.renews_on ? `Renews ${monthLabel(String(c.renews_on), "short")} ${String(c.renews_on).slice(0, 4)}` : "Milestones";
};

export async function overdueOf(tx: Tx, today: string): Promise<Overdue[]> {
  const rows = await tx.execute(sql`select i.id, i.contract_id, i.number, i.description, i.source, i.period, i.due_on::text as due_on, i.currency,
      round(i.total - coalesce((select sum(p.amount) from finance.payment p where p.invoice_id = i.id), 0) + coalesce((select sum(x.total) from finance.invoice x where x.credits_id = i.id), 0), 2)::text as open
    from finance.invoice i where i.kind = 'invoice' and i.due_on < ${today} order by i.due_on`);
  return rows.filter((r) => Number(r.open) > 0).map((r) => ({ id: r.id as string, contractId: r.contract_id as string, number: r.number as string, description: r.description as string,
    period: (r.period as string | null) ?? null, source: r.source as string, dueOn: r.due_on as string, open: String(r.open), currency: String(r.currency), days: daysBetween(r.due_on as string, today) }));
}

export async function contractRow(tx: Tx, c: Record<string, unknown>, project: { key: string; name: string } | undefined, today: string, overdue: Overdue[]): Promise<ContractView> {
  const id = c.id as string, currency = String(c.currency), mine = overdue.filter((o) => o.contractId === id);
  const [d] = await tx.execute(sql`select id, amount from finance.draft where contract_id = ${id} and status = 'open' order by created_at desc limit 1`);
  return {
    id, projectId: c.project_id as string, projectKey: project?.key ?? "", projectName: project?.name ?? String(c.client), client: String(c.client), legalEntityId: c.legal_entity_id as string,
    kind: c.kind as ContractKind, kindLabel: KIND_LABELS[c.kind as ContractKind], terms: termsOf(c), currency, value: amt(c.value), invoiced: amt(c.invoiced),
    invoicedPct: percent(String(c.invoiced), String(c.value)), next: await nextOf(tx, c, today), draft: d ? { id: d.id as string, amount: amt(d.amount) } : null,
    payments: await paymentsOf(tx, c, mine), overdue: mine,
  };
}
