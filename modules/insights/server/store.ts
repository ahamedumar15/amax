import { sql } from "drizzle-orm";
import type { Tx } from "@amax/db";
import { can, type Viewer } from "@amax/auth";
import type { Confidence, Horizon, InsightKind, InsightRef, InsightSource } from "../contracts";
import { asDay, READ } from "./read";

const INSIGHT = sql`select i.*, coalesce((select json_agg(json_build_object('label', s.label, 'evidenceRef', s.evidence_ref) order by s.position)
    from insights.source s where s.insight_id = i.id), '[]'::json) as sources from insights.insight i`;

export const toInsight = (r: Record<string, unknown>): InsightRef => ({
  id: r.id as string, kind: r.kind as InsightKind, key: (r.key as string | null) ?? null, title: r.title as string, body: r.body as string,
  suggestion: (r.suggestion as string | null) ?? null, confidence: r.confidence as Confidence, asOf: asDay(r.as_of), horizon: r.horizon as Horizon,
  scope: (r.scope as string | null) ?? null, needs: (r.needs as string | null) ?? null, data: (r.data ?? {}) as Record<string, unknown>,
  recordedBy: r.recorded_by as string, sources: r.sources as InsightSource[],
});

// An insight shows to a viewer who may read insights in its legal entity and holds what it needs
// there (a People risk needs hr:read), and only while it has a source (AC-1).
export const sees = (v: Viewer, i: { scope: string | null; needs: string | null; sources: InsightSource[] }) => {
  const at = i.scope ? { legalEntityId: i.scope } : {};
  return i.sources.length > 0 && can(v, READ, at) && (!i.needs || can(v, i.needs, at));
};

const live = sql`i.superseded_at is null and i.dismissed_at is null`;

export async function liveInsights(tx: Tx, v: Viewer, o: { kind?: InsightKind; horizon?: Horizon } = {}) {
  const kind = o.kind ? sql`and i.kind = ${o.kind}` : sql``;
  const horizon = o.horizon === "90d" ? sql`and i.horizon = '90d'` : sql``;
  const rows = await tx.execute(sql`${INSIGHT} where ${live} ${kind} ${horizon} order by i.rank, i.as_of desc, i.recorded_at`);
  return rows.map(toInsight).filter((i) => sees(v, i));
}

/** One insight the viewer may see, current or not, or null. */
export async function insightById(tx: Tx, v: Viewer, id: string) {
  const [r] = await tx.execute(sql`${INSIGHT} where i.id = ${id}`);
  const i = r ? toInsight(r) : null;
  if (!i || !sees(v, i)) return null;
  return { ...i, current: r.superseded_at === null && r.dismissed_at === null, dismissedBy: (r.dismissed_by as string | null) ?? null };
}
