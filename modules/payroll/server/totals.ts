import { sql } from "drizzle-orm";
import type { Tx } from "@amax/db";
import { amt } from "./read";

/** Cost centres with fewer people than this are folded together for totals-only readers. */
export const MIN_COST_CENTRE = 3;
const MIN = MIN_COST_CENTRE;

export type CostCentreTotal = { name: string; people: number; gross: string; deductions: string; net: string; employer: string };
export type Totals = { gross: string; deductions: string; net: string; employer: string };

/**
 * A run's totals, and per cost centre. Sums run in Postgres on numeric, so no float touches money.
 * `fold`: cost centres with fewer than MIN_COST_CENTRE people become one "Smaller cost centres" line,
 * so a totals-only reader (Finance) never sees one or two people's pay as a total.
 */
export async function totalsByCostCentre(tx: Tx, runId: string, fold: boolean): Promise<{ total: Totals & { people: number }; costCentres: CostCentreTotal[] }> {
  const rows = await tx.execute(sql`select cost_centre as name, count(*)::int as people, sum(gross) as gross, sum(deductions) as deductions, sum(net) as net, sum(employer_cost) as employer
    from payroll.payslip where run_id = ${runId} group by cost_centre order by sum(gross) desc, cost_centre`);
  const [t] = await tx.execute(sql`select count(*)::int as people, coalesce(sum(gross), 0) as gross, coalesce(sum(deductions), 0) as deductions, coalesce(sum(net), 0) as net, coalesce(sum(employer_cost), 0) as employer
    from payroll.payslip where run_id = ${runId}`);
  const total = { people: Number(t.people), gross: amt(t.gross), deductions: amt(t.deductions), net: amt(t.net), employer: amt(t.employer) };
  const big = fold ? rows.filter((r) => Number(r.people) >= MIN) : rows;
  const small = fold ? rows.filter((r) => Number(r.people) < MIN) : [];
  const out: CostCentreTotal[] = big.map((r) => ({ name: r.name as string, people: Number(r.people), gross: amt(r.gross), deductions: amt(r.deductions), net: amt(r.net), employer: amt(r.employer) }));
  if (small.length) {
    const [s] = await tx.execute(sql`select count(*)::int as people, sum(gross) as gross, sum(deductions) as deductions, sum(net) as net, sum(employer_cost) as employer
      from payroll.payslip where run_id = ${runId} and cost_centre in (${sql.join(small.map((r) => sql`${r.name as string}`), sql`, `)})`);
    // Folded together they may still be fewer than MIN; the entity total less the other lines would
    // then give them away, so only the entity total is shown.
    if (Number(s.people) < MIN) return { total, costCentres: [] };
    out.push({ name: "Smaller cost centres", people: Number(s.people), gross: amt(s.gross), deductions: amt(s.deductions), net: amt(s.net), employer: amt(s.employer) });
  }
  return { total, costCentres: out };
}
