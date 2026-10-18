import { sql } from "drizzle-orm";
import type { Tx } from "@amax/db";
import type { Viewer } from "@amax/auth";
import { homeEntity, requestsIn, type Row } from "./read";
import { sees } from "./scope";

export type Stats = {
  onLeave: { people: number; byType: [string, number][] };
  booked: { days: number; people: number };
  unusedAnnual: { days: number; country: string | null; entity: string | null };
  byType: [string, number][];
  perMonth: { month: string; days: number }[];
};

const MONTHS = ["J", "F", "M", "A", "M", "J", "J", "A", "S", "O", "N", "D"];
const sum = (rows: Row[]) => Math.round(rows.reduce((n, r) => n + (r.days as number), 0) * 10) / 10;
const tally = (rows: Row[], key: (r: Row) => string, size: (r: Row) => number) => {
  const m = new Map<string, number>();
  for (const r of rows) m.set(key(r), (m.get(key(r)) ?? 0) + size(r));
  return [...m].sort((a, b) => b[1] - a[1]);
};

/** Unused annual leave in the viewer's own entity (else the largest they can see): entitlement less the days taken or booked. */
async function unusedAnnual(tx: Tx, v: Viewer, year: number) {
  const rows = (await tx.execute(sql`select b.*, e.name as entity, e.country, b.entitled + b.carried - b.taken_before - coalesce(t.days, 0) as left_days
    from leave.balance b join core.legal_entity e on e.id = b.legal_entity_id
    left join lateral (select sum(days) as days from leave.request r where r.person_id = b.person_id and r.type = 'annual' and r.status = 'approved' and extract(year from r.starts_on) = b.year) t on true
    where b.type = 'annual' and b.year = ${year}`)).filter((r) => sees(v, r));
  const home = (await homeEntity(tx, v)).id;
  const largest = tally(rows, (r) => r.legal_entity_id as string, () => 1)[0]?.[0];
  const mine = rows.filter((r) => r.legal_entity_id === (rows.some((x) => x.legal_entity_id === home) ? home : largest));
  return { days: Math.round(mine.reduce((n, r) => n + Number(r.left_days), 0) * 10) / 10, country: mine[0] ? String(mine[0].country) : null, entity: (mine[0]?.entity as string | undefined) ?? null };
}

export async function statsFor(tx: Tx, v: Viewer, today: string): Promise<Stats> {
  const year = Number(today.slice(0, 4)), month = today.slice(0, 7);
  const taken = await requestsIn(tx, v, `${year}-01-01`, `${year}-12-31`, ["approved"]);
  const inYear = taken.filter((r) => (r.starts_on as string).startsWith(String(year)));
  const now = taken.filter((r) => (r.starts_on as string) <= today && (r.ends_on as string) >= today);
  const thisMonth = inYear.filter((r) => (r.starts_on as string).startsWith(month));
  return {
    onLeave: { people: new Set(now.map((r) => r.person_id)).size, byType: tally(now, (r) => r.type as string, () => 1) },
    booked: { days: sum(thisMonth), people: new Set(thisMonth.map((r) => r.person_id)).size },
    unusedAnnual: await unusedAnnual(tx, v, year),
    byType: tally(inYear, (r) => r.type as string, (r) => r.days as number),
    perMonth: MONTHS.slice(0, Number(today.slice(5, 7))).map((m, i) => ({ month: m, days: sum(inYear.filter((r) => Number((r.starts_on as string).slice(5, 7)) === i + 1)) })),
  };
}
