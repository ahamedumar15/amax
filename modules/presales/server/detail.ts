import { sql } from "drizzle-orm";
import type { Viewer } from "@amax/auth";
import { isoDay, read, str } from "./read";

export type ActivityRow = { id: string; title: string; note: string | null; kind: string; ownerName: string | null; on: string; progress: number };
export type TaskRow = { id: string; title: string; ownerName: string | null; due: string | null; status: string };
export type RiskRow = { id: string; kind: string; title: string; impact: string; ownerName: string | null; status: string; decidedOn: string | null };

/** An opportunity's activities (latest first), tasks (by due date) and risks, assumptions and decisions. */
export const recordsOf = (v: Viewer, opportunityId: string) =>
  read(v, async (tx) => {
    const [activities, tasks, risks] = await Promise.all([
      tx.execute(sql`select * from presales.activity where opportunity_id = ${opportunityId} order by on_date desc, created_at desc`),
      tx.execute(sql`select * from presales.task where opportunity_id = ${opportunityId} order by due nulls last, created_at`),
      tx.execute(sql`select * from presales.risk where opportunity_id = ${opportunityId} order by array_position(array['risk','issue','assumption','decision'], kind), created_at`),
    ]);
    return {
      activities: activities.map((a): ActivityRow => ({ id: a.id as string, title: a.title as string, note: str(a.note), kind: a.kind as string, ownerName: str(a.owner_name), on: isoDay(a.on_date)!, progress: Number(a.progress) })),
      tasks: tasks.map((t): TaskRow => ({ id: t.id as string, title: t.title as string, ownerName: str(t.owner_name), due: isoDay(t.due), status: t.status as string })),
      risks: risks.map((r): RiskRow => ({ id: r.id as string, kind: r.kind as string, title: r.title as string, impact: r.impact as string, ownerName: str(r.owner_name), status: r.status as string, decidedOn: isoDay(r.decided_on) })),
    };
  });

export type SuggestionRow = { id: string; client: string; summary: string; valueAmount: number; valueCurrency: string; valueUsd: number | null; source: string; sourceLabel: string; foundAt: string };

/** Open finds from the inbox agent, with a USD figure when the tenant has a rate for the currency. */
export const openSuggestions = (v: Viewer) =>
  read(v, async (tx) => (await tx.execute(sql`select s.*, case when s.value_currency = 'USD' then s.value_amount else s.value_amount * f.usd_rate end as value_usd
      from presales.suggestion s left join presales.fx_rate f on f.currency = s.value_currency where s.status = 'open' order by s.found_at`))
    .map((s): SuggestionRow => ({ id: s.id as string, client: s.client_name as string, summary: s.summary as string, valueAmount: Number(s.value_amount), valueCurrency: (s.value_currency as string).trim(),
      valueUsd: s.value_usd === null ? null : Number(s.value_usd), source: s.source as string, sourceLabel: s.source_label as string, foundAt: new Date(s.found_at as string).toISOString() })));
