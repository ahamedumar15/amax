import { sql } from "drizzle-orm";
import type { Tx } from "@amax/db";
import { moneyOf } from "@amax/core";
import { installedPacks, type PayLine } from "../packs";
import { amt, dayOf } from "./read";

export type PackInfo = { id: string; label: string; fictional: boolean };
export type Statutory = { pack: PackInfo | null; statutory: { label: string; payee: string; amount: string; dueOn: string }[]; filings: { label: string; dueOn: string }[] };

/** The run's country pack, when it is installed (a run still reads without it). */
export const packOf = (id: string) => installedPacks().find((p) => p.id === id) ?? null;
export function packInfo(id: string): PackInfo | null {
  const p = packOf(id);
  return p ? { id: p.id, label: p.label, fictional: Boolean(p.fictional) } : null;
}

/** 014 AC-4: what the run owes and must file, from its country pack's `statutory` and `filings`. */
export async function statutoryOf(tx: Tx, r: { id: string; pack: string; legalEntityId: string; currency: string; month: string; periodEnd: unknown }): Promise<Statutory> {
  const pack = packOf(r.pack);
  if (!pack) return { pack: null, statutory: [], filings: [] };
  const lines = await tx.execute(sql`select s.person_id, l.code, l.label, l.kind, l.amount, l.basis from payroll.payslip_line l join payroll.payslip s on s.id = l.payslip_id where s.run_id = ${r.id} order by s.person_id, l.position`);
  const by = new Map<string, PayLine[]>();
  for (const l of lines) {
    const line: PayLine = { code: l.code as string, label: l.label as string, kind: l.kind as PayLine["kind"], amount: moneyOf(String(l.amount), r.currency), basis: (l.basis as string | null) ?? null };
    by.set(l.person_id as string, [...(by.get(l.person_id as string) ?? []), line]);
  }
  const [e] = await tx.execute(sql`select country from core.legal_entity where id = ${r.legalEntityId}`);
  const run = { legalEntityId: r.legalEntityId, country: e.country as string, currency: r.currency, period: { month: r.month, from: `${r.month}-01`, to: dayOf(r.periodEnd)! }, payslips: [...by].map(([personId, l]) => ({ personId, lines: l })) };
  return {
    pack: packInfo(pack.id),
    statutory: pack.statutory(run).map((x) => ({ label: x.label, payee: x.payee, amount: amt(x.amount.amount), dueOn: x.dueOn })),
    filings: pack.filings(run).map((x) => ({ label: x.label, dueOn: x.dueOn })),
  };
}
