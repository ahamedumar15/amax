// The only import surface for other modules (docs/module-standard.md). Reads run in the caller's
// tenant transaction. Months are the first day of the month, "2026-10-01".
import { sql } from "drizzle-orm";
import type { Tx } from "@amax/db";

/** One person's share of a month on a delivery project (projectId) or on other work (work). Percent of a full-time month. */
export type Allocation = { id: string; personId: string; projectId: string | null; work: string | null; month: string; percent: number };

export const EVENTS = { allocationSet: "allocations.allocation.set", monthCopied: "allocations.month.copied" } as const;
/** Emitted for every allocate call: the months written, and percent 0 when the rows were removed. */
export type AllocationSet = { personId: string; projectId: string | null; work: string | null; months: string[]; percent: number; by: string };
/** The audited Copy to next month bulk action. */
export type MonthCopied = { team: string; from: string; to: string; rows: number; by: string };

export const monthOf = (iso: string) => `${iso.slice(0, 7)}-01`;
const day = (v: unknown) => (v instanceof Date ? v.toISOString() : String(v)).slice(0, 10);

const toAllocation = (r: Record<string, unknown>): Allocation => ({
  id: r.id as string, personId: r.person_id as string, projectId: (r.project_id as string | null) ?? null, work: (r.work as string | null) ?? null,
  month: day(r.month), percent: Number(r.percent),
});

const ids = (col: string, list?: string[]) => (list ? (list.length ? sql`and ${sql.identifier(col)}::text in (${sql.join(list.map((i) => sql`${i}`), sql`, `)})` : sql`and false`) : sql``);

/** Allocations between two months (inclusive), optionally for some people or projects. */
export async function listAllocations(tx: Tx, opts: { from: string; to: string; personIds?: string[]; projectIds?: string[] }): Promise<Allocation[]> {
  return (await tx.execute(sql`select * from allocations.allocation where month between ${monthOf(opts.from)}::date and ${monthOf(opts.to)}::date
    ${ids("person_id", opts.personIds)} ${ids("project_id", opts.projectIds)} order by person_id, month, project_id nulls last, work`)).map(toAllocation);
}

/** Each person's total percent per month: what over-allocation (above their FTE) is judged on. */
export async function personMonthTotals(tx: Tx, opts: { from: string; to: string; personIds?: string[] }): Promise<{ personId: string; month: string; percent: number }[]> {
  return (await tx.execute(sql`select person_id, month, sum(percent)::int as percent from allocations.allocation
    where month between ${monthOf(opts.from)}::date and ${monthOf(opts.to)}::date ${ids("person_id", opts.personIds)} group by person_id, month order by person_id, month`))
    .map((r) => ({ personId: r.person_id as string, month: day(r.month), percent: Number(r.percent) }));
}
