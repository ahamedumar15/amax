import { sql } from "drizzle-orm";
import type { Tx } from "@amax/db";
import { SUPPORT_AGENT, type Category } from "../contracts";

const WEEKS = 8;
const DAY = 86_400_000;
const pct = (n: number, d: number) => (d ? Math.round((100 * n) / d) : 0);
const ids = (queueIds: string[]) => `{${queueIds.join(",")}}`;

/** Monday 00:00 UTC of each of the last eight ISO weeks up to `now`, labelled "W42". */
export function weeksTo(now: Date) {
  const monday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) - ((now.getUTCDay() + 6) % 7) * DAY);
  return Array.from({ length: WEEKS }, (_, i) => {
    const start = new Date(monday.getTime() - (WEEKS - 1 - i) * 7 * DAY);
    const thursday = new Date(start.getTime() + 3 * DAY);
    const jan1 = Date.UTC(thursday.getUTCFullYear(), 0, 1);
    return { start, label: `W${Math.floor((thursday.getTime() - jan1) / DAY / 7) + 1}` };
  });
}

/** The tiles and charts for the queues a viewer works in, as of `now` (the tenant's clock). */
export async function statsOf(tx: Tx, queueIds: string[], now: Date) {
  const q = ids(queueIds), at = now.toISOString();
  const month = sql`date_trunc('month', ${at}::timestamptz at time zone 'UTC') at time zone 'UTC'`;
  const [s] = await tx.execute(sql`select
      count(*) filter (where status in ('open', 'waiting'))::int as open, count(*) filter (where status = 'waiting')::int as waiting,
      count(*) filter (where status = 'resolved' and closed_at >= ${month} and closed_at <= ${at})::int as solved,
      count(*) filter (where status = 'resolved' and closed_at >= ${month} and closed_at <= ${at} and handled_by = ${SUPPORT_AGENT})::int as by_agent,
      count(*) filter (where status = 'resolved' and closed_at >= ${month} - interval '1 month' and closed_at < ${month})::int as solved_before,
      count(*) filter (where status = 'resolved' and closed_at >= ${month} - interval '1 month' and closed_at < ${month} and handled_by = ${SUPPORT_AGENT})::int as by_agent_before,
      avg(extract(epoch from first_response_at - opened_at) / 60) filter (where opened_at >= ${month} and first_response_at is not null) as first_response
    from helpdesk.ticket where queue_id = any(${q}::uuid[])`);
  const [r] = await tx.execute(sql`select avg(r.score)::float as score, count(*)::int as ratings from helpdesk.rating r join helpdesk.ticket t on t.id = r.ticket_id
    where t.queue_id = any(${q}::uuid[]) and r.rated_at > ${at}::timestamptz - interval '90 days' and r.rated_at <= ${at}`);
  const [target] = await tx.execute(sql`select min(response_minutes)::int as minutes from helpdesk.sla where queue_id = any(${q}::uuid[]) and priority = 'normal'`);
  const [top] = await tx.execute(sql`select category from helpdesk.ticket where queue_id = any(${q}::uuid[]) and status = 'resolved' and handled_by = ${SUPPORT_AGENT}
    and closed_at >= ${month} and closed_at <= ${at} group by category order by count(*) desc, category limit 1`);
  const agentShare = pct(Number(s.by_agent), Number(s.solved)), before = pct(Number(s.by_agent_before), Number(s.solved_before));
  return {
    agentMostly: (top?.category as Category | undefined) ?? null, open: Number(s.open), waiting: Number(s.waiting), agentShare, agentSharePoints: Number(s.solved_before) ? agentShare - before : null,
    firstResponseMinutes: s.first_response === null ? null : Math.round(Number(s.first_response)), responseTarget: target?.minutes === null || target?.minutes === undefined ? null : Number(target.minutes),
    satisfaction: r.ratings ? Math.round(Number(r.score) * 10) / 10 : null, ratings: Number(r.ratings),
    weeks: await weekly(tx, q, now), categories: await categories(tx, q, month, at),
  };
}

async function weekly(tx: Tx, q: string, now: Date) {
  const weeks = weeksTo(now);
  const rows = await tx.execute(sql`select floor(extract(epoch from closed_at - ${weeks[0].start.toISOString()}::timestamptz) / ${7 * 86400})::int as w, handled_by = ${SUPPORT_AGENT} as agent, count(*)::int as n
    from helpdesk.ticket where queue_id = any(${q}::uuid[]) and status = 'resolved' and closed_at >= ${weeks[0].start.toISOString()} and closed_at <= ${now.toISOString()} group by 1, 2`);
  const n = (i: number, agent: boolean) => Number(rows.find((x) => Number(x.w) === i && x.agent === agent)?.n ?? 0);
  return weeks.map((w, i) => ({ label: w.label, byAgent: n(i, true), byPeople: n(i, false) }));
}

async function categories(tx: Tx, q: string, month: ReturnType<typeof sql>, at: string) {
  const rows = await tx.execute(sql`select category, count(*)::int as n from helpdesk.ticket where queue_id = any(${q}::uuid[]) and opened_at >= ${month} and opened_at <= ${at}
    group by category order by category = 'Other', n desc, category`);
  return rows.map((x) => ({ category: x.category as Category, count: Number(x.n) }));
}
