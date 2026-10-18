import { sql } from "drizzle-orm";
import type { Tx } from "@amax/db";
import { uninvoicedTime } from "./drafts";
import { money } from "./fmt";
import { amt, monthLabel } from "./read";

export type Overdue = { id: string; contractId: string; number: string; description: string; period: string | null; source: string; dueOn: string; open: string; currency: string; days: number };

const short = (month: string) => monthLabel(month, "short");

async function nextMilestone(tx: Tx, id: string, cur: string) {
  const [m] = await tx.execute(sql`select label, amount, release_version, status from finance.milestone where contract_id = ${id} and status <> 'invoiced' order by position limit 1`);
  if (!m) return "Fully invoiced";
  const sum = money(amt(m.amount), cur);
  if (!m.release_version) return `${sum}, ${m.label as string}`;
  return m.status === "drafted" ? `${sum} for ${m.release_version as string}, drafted from its Prod release` : `${sum} when ${m.release_version as string} is in Prod`;
}

async function nextRetainer(tx: Tx, c: Record<string, unknown>, month: string, cur: string) {
  const [r] = await tx.execute(sql`select exists (select 1 from finance.invoice where contract_id = ${c.id} and source = 'retainer' and kind = 'invoice' and period = ${month}) as done,
    coalesce((select sum(subtotal) from finance.invoice where contract_id = ${c.id}), 0) + ${c.monthly_fee}::numeric <= ${c.value}::numeric as fits`);
  const name = monthLabel(month).split(" ")[0];
  if (r.done) return `${name} retainer invoiced`;
  return r.fits && month >= String(c.starts_on).slice(0, 7) ? `${name} retainer, ${money(amt(c.monthly_fee), cur)}, ready` : "Fully invoiced";
}

export async function nextOf(tx: Tx, c: Record<string, unknown>, today: string): Promise<string> {
  const cur = String(c.currency), month = today.slice(0, 7);
  if (c.kind === "fixed") return nextMilestone(tx, c.id as string, cur);
  if (c.kind === "retainer") return nextRetainer(tx, c, month, cur);
  const t = await uninvoicedTime(tx, { id: c.id as string, value: String(c.value) }, month);
  return Number(t.amount) > 0 ? `${money(t.amount, cur)} of ${monthLabel(month).split(" ")[0]} hours to date, not yet invoiced` : "No uninvoiced hours yet";
}

const what = (o: Overdue) => (o.source === "tm" && o.period ? `${short(o.period)} hours` : o.description);

export async function paymentsOf(tx: Tx, c: Record<string, unknown>, overdue: Overdue[]): Promise<{ tone: "good" | "bad"; text: string }> {
  if (overdue.length === 1) {
    const o = overdue[0];
    return { tone: "bad", text: `${o.number} ${money(o.open, o.currency)} (${what(o)}), ${o.days} days overdue` };
  }
  if (overdue.length) return { tone: "bad", text: `${overdue.length} invoices overdue` };
  if (c.kind !== "retainer") return { tone: "good", text: "On time" };
  const paid = await tx.execute(sql`select i.period from finance.invoice i where i.contract_id = ${c.id} and i.source = 'retainer' and i.kind = 'invoice'
    and coalesce((select sum(p.amount) from finance.payment p where p.invoice_id = i.id), 0) >= i.total order by i.period`);
  if (!paid.length) return { tone: "good", text: "On time" };
  const [a, b] = [paid[0].period as string, paid[paid.length - 1].period as string];
  return { tone: "good", text: `${a === b ? short(a) : `${short(a)}–${short(b)}`} paid` };
}
