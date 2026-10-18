import { sql, type SQL } from "drizzle-orm";
import type { Tx } from "@amax/db";
import type { Viewer } from "@amax/auth";
import { listSuggestions } from "@amax/agents/server";
import { listProjectRefs } from "@amax/delivery/contracts";
import { ledeOf, overdueNote } from "./lede";
import { CONTRACTS, contractRow, overdueOf, type ContractView } from "./rows";
import { amt, read, sees, todayOf } from "./read";
import { ageingOf, byEntityOf, headlineOf, monthlyOf, type Ageing, type EntityTotal, type Month } from "./totals";

export type Financials = {
  asOf: string; currency: string; lede: string; contractValue: string; invoiced: string; invoicedPct: number; overdue: string; overdueNote: string;
  monthly: Month[]; target: string; ageing: Ageing; contracts: (ContractView & { suggestionId: string | null })[]; byEntity: EntityTotal[];
};

const cents = (v: string) => Math.round(Number(v) * 100);

async function suggestionsBy(v: Viewer) {
  const open = await listSuggestions(v, { kind: "finance.invoice-draft" }).catch(() => []);
  return new Map(open.filter((s) => ["open", "queried"].includes(s.status)).map((s) => [s.target.id, s.id]));
}

export async function financialsIn(tx: Tx, v: Viewer, filter: SQL = sql`true`): Promise<Financials | null> {
  const [s] = await tx.execute(sql`select monthly_target, target_currency from finance.settings`);
  const today = await todayOf(tx);
  const rows = (await tx.execute(sql`${CONTRACTS} where ${filter} order by c.value desc`)).filter((c) => sees(v, c.legal_entity_id as string));
  if (!rows.length) return null;
  const projects = new Map((await listProjectRefs(tx)).map((p) => [p.id, p]));
  const overdue = (await overdueOf(tx, today)).filter((o) => rows.some((c) => c.id === o.contractId));
  const drafts = await suggestionsBy(v);
  const contracts = [];
  for (const c of rows) {
    const row = await contractRow(tx, c, projects.get(c.project_id as string), today, overdue);
    contracts.push({ ...row, suggestionId: row.draft ? (drafts.get(row.draft.id) ?? null) : null });
  }
  const ids = rows.map((c) => c.id as string);
  const currency = String(s?.target_currency ?? contracts[0].currency);
  const head = await headlineOf(tx, ids, today, currency);
  const ageing = await ageingOf(tx, ids, today, currency);
  return {
    asOf: today, currency, lede: ledeOf(contracts), contractValue: head.value, invoiced: head.invoiced, invoicedPct: Math.round((cents(head.invoiced) / cents(head.value)) * 100),
    overdue: amt((cents(ageing.open) - cents(ageing.buckets[0].amount)) / 100),
    overdueNote: overdueNote(overdue),
    monthly: await monthlyOf(tx, ids, today, currency), target: amt(s?.monthly_target ?? 0), ageing, contracts, byEntity: await byEntityOf(tx, ids),
  };
}

export const getFinancials = (v: Viewer) => read(v, (tx) => financialsIn(tx, v));
