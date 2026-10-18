import { sql } from "drizzle-orm";
import { z } from "zod";
import type { Tx } from "@amax/db";
import { defineService, type ServiceContext } from "@amax/core/server";
import { CONFIDENCE, EVENTS, HORIZONS, KINDS, type InsightDismissed, type InsightRecorded } from "../contracts";
import { ADMIN, by } from "./read";

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "give the day as YYYY-MM-DD");
export const EVIDENCE = /^(\/[A-Za-z0-9/_?=&.-]*|https:\/\/\S+)$/;

export const SourceInput = z.object({
  label: z.string().min(1).max(300).describe("What the insight rests on, like \"allocations and the presales board\""),
  evidenceRef: z.string().regex(EVIDENCE, "link the evidence: an amax path like /presales, or an https URL").describe("Where to see the evidence"),
});

export const InsightInput = z.object({
  kind: z.enum(KINDS), key: z.string().min(1).max(200).optional().describe("What it is about; a newer insight with the same key replaces the older one"),
  title: z.string().min(1).max(200), body: z.string().max(2000), suggestion: z.string().max(500).nullish(),
  confidence: z.enum(CONFIDENCE), asOf: day, horizon: z.enum(HORIZONS).default("90d"),
  scope: z.uuid().nullish().describe("The legal entity it is about; leave out for the whole tenant"),
  needs: z.string().regex(/^[a-z-]+:[a-z:-]+$/).nullish().describe("A permission a viewer must also hold to see it"),
  data: z.record(z.string(), z.unknown()).default({}), rank: z.number().int().min(0).max(99).default(0),
  sources: z.array(SourceInput).min(1, "an insight needs at least one source with a link to its evidence").max(12),
});
export type InsightInput = z.input<typeof InsightInput>;

/** Records one insight and its sources in the caller's transaction (the service below, and fixtures). */
export async function writeInsight(tx: Tx, ctx: ServiceContext, raw: InsightInput) {
  const a = InsightInput.parse(raw);
  if (a.key) await tx.execute(sql`update insights.insight set superseded_at = now() where key = ${a.key} and superseded_at is null`);
  const [row] = await tx.execute(sql`insert into insights.insight (tenant_id, kind, key, title, body, suggestion, confidence, as_of, horizon, scope, needs, data, rank, recorded_by)
    values (${ctx.tenantId}, ${a.kind}, ${a.key ?? null}, ${a.title}, ${a.body}, ${a.suggestion ?? null}, ${a.confidence}, ${a.asOf}, ${a.horizon}, ${a.scope ?? null},
      ${a.needs ?? null}, ${JSON.stringify(a.data)}::jsonb, ${a.rank}, ${by(ctx)}) returning id`);
  for (const [i, s] of a.sources.entries())
    await tx.execute(sql`insert into insights.source (tenant_id, insight_id, label, evidence_ref, position) values (${ctx.tenantId}, ${row.id}, ${s.label}, ${s.evidenceRef}, ${i})`);
  return { id: row.id as string, kind: a.kind, sources: a.sources.length };
}

export const recordInsight = defineService({
  name: "insights.insight.record", action: "insights:record", resource: "insights.insight", input: InsightInput,
  async run(tx, a, ctx) {
    const out = await writeInsight(tx, ctx, a);
    const payload: InsightRecorded = { insightId: out.id, kind: out.kind, sources: out.sources, by: by(ctx) };
    return { result: { insightId: out.id }, resourceId: out.id, after: { kind: a.kind, title: a.title, sources: a.sources.length }, events: [{ name: EVENTS.recorded, payload }] };
  },
});

export const dismissInsight = defineService({
  name: "insights.insight.dismiss", action: "insights:dismiss", resource: "insights.insight", input: z.object({ insightId: z.uuid() }),
  async run(tx, a, ctx) {
    const [row] = await tx.execute(sql`update insights.insight set dismissed_at = now(), dismissed_by = ${by(ctx)} where id = ${a.insightId} and dismissed_at is null returning kind`);
    if (!row) throw Object.assign(new Error("no such insight, or it was already dismissed"), { code: "not_found" });
    const payload: InsightDismissed = { insightId: a.insightId, kind: row.kind as InsightDismissed["kind"], by: by(ctx) };
    return { result: { insightId: a.insightId, dismissed: true }, resourceId: a.insightId, before: { dismissed: false }, after: { dismissed: true }, events: [{ name: EVENTS.dismissed, payload }] };
  },
});

export const setBriefingReader = defineService({
  name: "insights.settings.briefing", action: ADMIN, resource: "insights.settings",
  input: z.object({ userId: z.uuid().describe("The person the weekly briefing is written for; it reads only what they may see") }),
  async run(tx, a, ctx) {
    const [prior] = await tx.execute(sql`select briefing_for from insights.settings`);
    await tx.execute(sql`insert into insights.settings (tenant_id, briefing_for) values (${ctx.tenantId}, ${a.userId}) on conflict (tenant_id) do update set briefing_for = excluded.briefing_for`);
    return { result: { briefingFor: a.userId }, resourceId: ctx.tenantId, before: { briefingFor: (prior?.briefing_for as string | null) ?? null }, after: { briefingFor: a.userId } };
  },
});
