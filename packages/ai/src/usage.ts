import { sql, type SQL } from "drizzle-orm";
import { type Db, type Tx, withTenant } from "@amax/db";
import { ForbiddenError } from "@amax/core/server";

export const USAGE_SOURCES = { chat: ["chat"], agents: ["agent"], jobs: ["job"] } as const;
export type UsageSource = keyof typeof USAGE_SOURCES;
export type UsageScope = "self" | "tenant";
export type UsageQuery = { scope: UsageScope; month?: string; source?: UsageSource };
export type UsageViewer = { tenantId: string; userId: string; roles: string[] };

/** `costUsd` is null when no call in the group has a known price: unknown, never $0. */
export type UsageTotals = { calls: number; inputTokens: number; outputTokens: number; costUsd: number | null; unknownCostCalls: number };
export type AiUsage = {
  scope: UsageScope; month: string; source: UsageSource | null; totals: UsageTotals & { people: number };
  bySource: Record<UsageSource, Pick<UsageTotals, "costUsd" | "unknownCostCalls">>;
  byDay: (UsageTotals & { day: string })[];
  byPerson: (UsageTotals & { userId: string | null; name: string | null; lastUsed: string })[];
  byConversation: (UsageTotals & { conversationId: string; userId: string | null; name: string | null; startedAt: string })[];
};

export const monthOf = (d = new Date()) => d.toISOString().slice(0, 7);
const range = (month: string) => {
  const [y, m] = month.split("-").map(Number);
  return [new Date(Date.UTC(y, m - 1, 1)).toISOString(), new Date(Date.UTC(y, m, 1)).toISOString()];
};

const TOTALS = sql`count(*)::int as calls, coalesce(sum(c.input_tokens), 0)::bigint as input_tokens, coalesce(sum(c.output_tokens), 0)::bigint as output_tokens,
  sum(c.cost_usd)::float as cost_usd, (count(*) filter (where c.cost_usd is null))::int as unknown_cost_calls`;
const totals = (r: Record<string, unknown>): UsageTotals => ({
  calls: Number(r.calls), inputTokens: Number(r.input_tokens), outputTokens: Number(r.output_tokens),
  costUsd: r.cost_usd === null ? null : Number(r.cost_usd), unknownCostCalls: Number(r.unknown_cost_calls),
});
const iso = (v: unknown) => new Date(v as string).toISOString();

async function grouped(tx: Tx, where: SQL) {
  const [all] = await tx.execute(sql`select ${TOTALS}, count(distinct c.user_id)::int as people from ai.call c where ${where}`);
  const src = await tx.execute(sql`select c.source, ${TOTALS} from ai.call c where ${where} group by c.source`);
  const days = await tx.execute(sql`select to_char(c.at at time zone 'UTC', 'YYYY-MM-DD') as day, ${TOTALS} from ai.call c where ${where} group by 1 order by 1`);
  const people = await tx.execute(sql`select c.user_id, u.name, max(c.at) as last_used, ${TOTALS} from ai.call c left join auth.user u on u.id = c.user_id
    where ${where} group by c.user_id, u.name order by sum(c.cost_usd) desc nulls last, count(*) desc`);
  const convos = await tx.execute(sql`select c.conversation_id, c.user_id, u.name, min(c.at) as started_at, ${TOTALS} from ai.call c left join auth.user u on u.id = c.user_id
    where ${where} and c.conversation_id is not null group by c.conversation_id, c.user_id, u.name order by sum(c.cost_usd) desc nulls last, count(*) desc limit 10`);
  const costOf = (s: UsageSource) => {
    const rows = src.filter((r) => (USAGE_SOURCES[s] as readonly string[]).includes(r.source as string)).map(totals);
    const priced = rows.filter((r) => r.costUsd !== null);
    return { costUsd: priced.length ? priced.reduce((n, r) => n + r.costUsd!, 0) : null, unknownCostCalls: rows.reduce((n, r) => n + r.unknownCostCalls, 0) };
  };
  return {
    totals: { ...totals(all), people: Number(all.people) },
    bySource: { chat: costOf("chat"), agents: costOf("agents"), jobs: costOf("jobs") },
    byDay: days.map((r) => ({ day: r.day as string, ...totals(r) })),
    byPerson: people.map((r) => ({ userId: (r.user_id as string | null) ?? null, name: (r.name as string | null) ?? null, lastUsed: iso(r.last_used), ...totals(r) })),
    byConversation: convos.map((r) => ({ conversationId: r.conversation_id as string, userId: (r.user_id as string | null) ?? null, name: (r.name as string | null) ?? null, startedAt: iso(r.started_at), ...totals(r) })),
  };
}

function filter(viewer: UsageViewer, q: UsageQuery) {
  if (q.scope === "tenant" && !viewer.roles.includes("Admin")) throw new ForbiddenError("read", "ai.usage of the tenant");
  const month = q.month ?? monthOf();
  const [from, to] = range(month);
  const parts = [sql`c.at >= ${from} and c.at < ${to}`];
  if (q.scope === "self") parts.push(sql`c.user_id = ${viewer.userId}`);
  if (q.source) parts.push(sql`c.source in (${sql.join(USAGE_SOURCES[q.source].map((s) => sql`${s}`), sql`, `)})`);
  return { month, where: sql.join(parts, sql` and `) };
}

/** One query for the AI usage screen and get_ai_usage, so both show the same numbers. */
export async function aiUsage(db: Db, viewer: UsageViewer, q: UsageQuery): Promise<AiUsage> {
  const { month, where } = filter(viewer, q);
  const data = await withTenant(db, viewer.tenantId, (tx) => grouped(tx, where));
  return { scope: q.scope, month, source: q.source ?? null, ...data };
}

/** Totals only, the same filter and sums as aiUsage: one query, cheap enough for the chat footer on every page. */
export async function aiUsageTotals(db: Db, viewer: UsageViewer, q: UsageQuery): Promise<UsageTotals> {
  const { where } = filter(viewer, q);
  const [row] = await withTenant(db, viewer.tenantId, (tx) => tx.execute(sql`select ${TOTALS} from ai.call c where ${where}`));
  return totals(row);
}
