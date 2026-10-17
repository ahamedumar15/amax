import { sql } from "drizzle-orm";
import type { Tx } from "@amax/db";
import type { Viewer } from "@amax/auth";
import { pipelineTotals } from "../contracts";
import { read } from "./read";
import { LIVE } from "./sql";

const monthStart = (today: string, back: number) => { const d = new Date(`${today.slice(0, 7)}-01T00:00:00Z`); d.setUTCMonth(d.getUTCMonth() - back); return d.toISOString().slice(0, 10); };

/** Won share of deals closed in the 12 months ending `yearsBack` years before `today`, and average days to close a won one. */
export async function closedWindow(tx: Tx, today: string, yearsBack = 0) {
  const end = sql`(${today}::date - make_interval(years => ${yearsBack}))`;
  const [r] = await tx.execute(sql`select count(*) filter (where stage = 'won')::int as won, count(*)::int as closed,
      avg(extract(epoch from closed_at - created_at) / 86400) filter (where stage = 'won') as days
    from presales.opportunity o where ${LIVE} and closed_at > ${end} - interval '12 months' and closed_at < ${end} + interval '1 day'`);
  return { won: Number(r.won), closed: Number(r.closed), days: r.days === null ? null : Number(r.days) };
}

export const pipelineStats = (v: Viewer, today: string) =>
  read(v, async (tx) => {
    const totals = await pipelineTotals(tx);
    const now = await closedWindow(tx, today);
    const yearAgo = await closedWindow(tx, today, 1);
    const rate = (w: { won: number; closed: number }) => (w.closed ? Math.round((w.won / w.closed) * 100) : null);
    const snaps = await tx.execute(sql`select to_char(month, 'YYYY-MM-DD') as month, total_usd, weighted_usd from presales.pipeline_snapshot
      where month >= ${monthStart(today, 5)}::date and month < ${monthStart(today, 0)}::date order by month`);
    const series = [...snaps.map((s) => ({ month: s.month as string, total: Number(s.total_usd), weighted: Number(s.weighted_usd) })),
      { month: monthStart(today, 0), total: Number(totals.open.amount), weighted: Number(totals.weighted.amount) }];
    return { totals, winRate: rate(now), winRateBefore: rate(yearAgo), daysToClose: now.days === null ? null : Math.round(now.days), series };
  });

/** Records last month's closing pipeline. Run on the 1st; re-running the same month is a no-op. */
export async function snapshotPipeline(tx: Tx, tenantId: string, today: string) {
  const totals = await pipelineTotals(tx);
  await tx.execute(sql`insert into presales.pipeline_snapshot (tenant_id, month, total_usd, weighted_usd)
    values (${tenantId}, ${monthStart(today, 1)}::date, ${totals.open.amount}, ${totals.weighted.amount}) on conflict do nothing`);
}

/** The win-rate ticket's note, naming which window has no closed deals when one is empty. */
export function winRateNote(now: number | null, before: number | null) {
  if (now === null) return "No deals closed in the last 12 months";
  if (before === null) return "No deals closed the year before";
  const change = now - before;
  return change === 0 ? "Same as the year before" : `${change > 0 ? "Up" : "Down"} ${Math.abs(change)} point${Math.abs(change) === 1 ? "" : "s"}`;
}
