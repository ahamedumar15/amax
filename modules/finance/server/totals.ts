import { sql, type SQL } from "drizzle-orm";
import type { Tx } from "@amax/db";
import { amt, monthLabel } from "./read";

export type Month = { month: string; label: string; amount: string; partial: boolean };
export type Bucket = { label: string; amount: string };
export type Ageing = { open: string; buckets: Bucket[] };
export type EntityTotal = { legalEntityId: string; entityName: string; baseCurrency: string; invoiced: string };

const fx = (cur: SQL, target: string, on: string) => sql`(case when ${cur} = ${target} then 1 else coalesce(
  (select r.rate from finance.fx_rate r where r.from_currency = ${cur} and r.to_currency = ${target} and r.as_of <= ${on} order by r.as_of desc limit 1),
  (select 1 / r.rate from finance.fx_rate r where r.from_currency = ${target} and r.to_currency = ${cur} and r.as_of <= ${on} order by r.as_of desc limit 1)) end)`;
const within = (ids: string[], col: SQL) => (ids.length ? sql`${col} in (${sql.join(ids.map((i) => sql`${i}::uuid`), sql`, `)})` : sql`false`);
const OPEN = sql`i.total - coalesce((select sum(p.amount) from finance.payment p where p.invoice_id = i.id), 0) + coalesce((select sum(x.total) from finance.invoice x where x.credits_id = i.id), 0)`;

async function converted(tx: Tx, q: SQL) {
  const [r] = await tx.execute(q);
  if (r.missing) throw new Error("a total needs an exchange rate that isn't stored; add one with set_fx_rate");
  return r;
}

export async function headlineOf(tx: Tx, ids: string[], on: string, target: string) {
  const r = await converted(tx, sql`select round(coalesce(sum(c.value * ${fx(sql`c.currency`, target, on)}), 0), 2)::text as value,
      round(coalesce((select sum(i.subtotal * ${fx(sql`i.currency`, target, on)}) from finance.invoice i where ${within(ids, sql`i.contract_id`)}), 0), 2)::text as invoiced,
      bool_or(${fx(sql`c.currency`, target, on)} is null) as missing
    from finance.contract c where ${within(ids, sql`c.id`)}`);
  return { value: String(r.value), invoiced: String(r.invoiced) };
}

export async function monthlyOf(tx: Tx, ids: string[], on: string, target: string): Promise<Month[]> {
  const rows = await tx.execute(sql`select m::date::text as month, round(coalesce((select sum(i.subtotal * ${fx(sql`i.currency`, target, on)}) from finance.invoice i
      where ${within(ids, sql`i.contract_id`)} and date_trunc('month', i.issued_on) = m), 0), 2)::text as amount
    from generate_series(date_trunc('month', ${on}::date) - interval '5 months', date_trunc('month', ${on}::date), interval '1 month') m order by m`);
  return rows.map((r, i) => ({ month: String(r.month).slice(0, 7), label: monthLabel(String(r.month), "short"), amount: String(r.amount), partial: i === rows.length - 1 }));
}

export async function ageingOf(tx: Tx, ids: string[], on: string, target: string): Promise<Ageing> {
  const r = await converted(tx, sql`select ${sql.raw(["current", "d30", "d60", "d90"].map((b, k) => `round(coalesce(sum(x.open) filter (where ${["x.late <= 0", "x.late between 1 and 30", "x.late between 31 and 60", "x.late > 60"][k]}), 0), 2)::text as ${b}`).join(", "))},
      round(coalesce(sum(x.open), 0), 2)::text as open, bool_or(x.rate is null) as missing
    from (select ${OPEN} * ${fx(sql`i.currency`, target, on)} as open, ${fx(sql`i.currency`, target, on)} as rate, ${on}::date - i.due_on as late
      from finance.invoice i where i.kind = 'invoice' and ${within(ids, sql`i.contract_id`)}) x where x.open > 0`);
  const buckets = [["Current", r.current], ["1–30 days", r.d30], ["31–60 days", r.d60], ["Over 60", r.d90]].map(([label, v]) => ({ label: String(label), amount: amt(v) }));
  return { open: amt(r.open), buckets };
}

export async function byEntityOf(tx: Tx, ids: string[]): Promise<EntityTotal[]> {
  const rows = await tx.execute(sql`select e.id, e.name, i.base_currency, round(sum(i.base_subtotal), 2)::text as invoiced from finance.invoice i join core.legal_entity e on e.id = i.legal_entity_id
    where ${within(ids, sql`i.contract_id`)} group by e.id, e.name, i.base_currency order by e.name`);
  return rows.map((r) => ({ legalEntityId: r.id as string, entityName: r.name as string, baseCurrency: String(r.base_currency), invoiced: String(r.invoiced) }));
}
