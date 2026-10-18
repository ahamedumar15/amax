import { sql } from "drizzle-orm";
import type { Viewer } from "@amax/auth";
import { numberOf, type Health, type Stage } from "../contracts";
import { iso, isoDay, read, str } from "./read";
import { COLS, FROM, LIVE } from "./sql";

export type OpportunityRow = {
  id: string; number: string; client: string; country: string | null; title: string; stage: Stage; winChance: number;
  valueAmount: number; valueCurrency: string; valueUsd: number; usdRate: number; health: Health; ownerName: string | null; leadName: string | null;
  service: string | null; costCentre: string | null; estimateDays: number | null; expectedClose: string | null; leadSource: string | null;
  competing: string | null; nextStep: string | null; lostReason: string | null; lostCompetitor: string | null; closedAt: string | null;
  stageSince: string; projectKey: string | null; next: { kind: string; on: string } | null;
};

export const toRow = (r: Record<string, unknown>): OpportunityRow => ({
  id: r.id as string, number: numberOf(Number(r.number)), client: r.client_name as string, country: str(r.client_country), title: r.title as string,
  stage: r.stage as Stage, winChance: Number(r.win_chance), valueAmount: Number(r.value_amount), valueCurrency: (r.value_currency as string).trim(),
  valueUsd: Number(r.value_usd), usdRate: Number(r.usd_rate), health: r.health as Health, ownerName: str(r.owner_name), leadName: str(r.lead_name),
  service: str(r.service), costCentre: str(r.cost_centre), estimateDays: r.estimate_days === null ? null : Number(r.estimate_days), expectedClose: isoDay(r.expected_close),
  leadSource: str(r.lead_source), competing: str(r.competing), nextStep: str(r.next_step), lostReason: str(r.lost_reason), lostCompetitor: str(r.lost_competitor),
  closedAt: iso(r.closed_at), stageSince: iso(r.stage_since)!, projectKey: str(r.project_key),
  next: r.next_kind ? { kind: r.next_kind as string, on: isoDay(r.next_on)! } : null,
});

const NEXT = (today: string) => sql`(select kind from presales.activity a where a.opportunity_id = o.id and a.on_date >= ${today}::date order by a.on_date limit 1) as next_kind,
  (select on_date from presales.activity a where a.opportunity_id = o.id and a.on_date >= ${today}::date order by a.on_date limit 1) as next_on`;

/** Every live opportunity with its next upcoming activity; open ones first, then closed newest first. */
export const listOpportunities = (v: Viewer, today: string) =>
  read(v, async (tx) => (await tx.execute(sql`select ${COLS}, ${NEXT(today)} from ${FROM} where ${LIVE} order by o.closed_at desc nulls first, o.value_usd desc`)).map(toRow));

/** `ref`: a number (PS-0142), or the opportunity's id (059: pins use the id; a number given with it only narrows). */
export const getOpportunity = (v: Viewer, ref: string | { opportunityId?: string; number?: string }, today: string) =>
  read(v, async (tx) => {
    const { opportunityId, number } = typeof ref === "string" ? { opportunityId: undefined, number: ref } : ref;
    if (!opportunityId && !number) throw new Error("say which opportunity: an opportunityId or a number");
    const n = number === undefined ? undefined : Number(/^PS-(\d+)$/.exec(number)?.[1] ?? NaN);
    if (n !== undefined && !Number.isFinite(n)) return null;
    const where = sql.join([opportunityId ? sql`o.id = ${opportunityId}` : undefined, n !== undefined ? sql`o.number = ${n}` : undefined].filter((x) => x !== undefined), sql` and `);
    const [r] = await tx.execute(sql`select ${COLS}, ${NEXT(today)} from ${FROM} where ${LIVE} and ${where}`);
    return r ? toRow(r) : null;
  });

export type StageChangeRow = { at: string; byName: string; opportunityId: string; number: string; client: string; title: string; from: Stage | null; to: Stage; fromChance: number | null; toChance: number; note: string | null; reason: string | null; competitor: string | null };

const change = (r: Record<string, unknown>): StageChangeRow => ({
  at: iso(r.at)!, byName: r.by_name as string, opportunityId: r.opportunity_id as string, number: numberOf(Number(r.number)), client: r.client_name as string, title: r.title as string,
  from: (r.from_stage as Stage | null) ?? null, to: r.to_stage as Stage, fromChance: r.from_chance === null ? null : Number(r.from_chance), toChance: Number(r.to_chance),
  note: str(r.note), reason: r.to_stage === "lost" ? str(r.lost_reason) : null, competitor: r.to_stage === "lost" ? str(r.lost_competitor) : null,
});

const CHANGES = sql`select s.*, o.number, o.title, o.lost_reason, o.lost_competitor, c.name as client_name from presales.stage_change s
  join presales.opportunity o on o.id = s.opportunity_id join presales.client c on c.id = o.client_id`;

export const recentChanges = (v: Viewer, limit = 4) =>
  read(v, async (tx) => (await tx.execute(sql`${CHANGES} where ${LIVE} and s.from_stage is not null order by s.at desc limit ${limit}`)).map(change));

export const historyOf = (v: Viewer, opportunityId: string) =>
  read(v, async (tx) => (await tx.execute(sql`${CHANGES} where s.opportunity_id = ${opportunityId} order by s.at desc`)).map(change));
