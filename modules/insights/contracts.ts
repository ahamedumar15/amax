// The only import surface for other modules (docs/module-standard.md). The Overview's "Agent
// insights" card reads here. Reads take the signed-in viewer and return only the insights they may
// see; every insight comes with its sources (026 AC-1).
import type { Tx } from "@amax/db";
import { can, type Viewer } from "@amax/auth";
import { ForbiddenError } from "@amax/core/server";
import { liveInsights } from "./server/store";

export const KINDS = ["briefing", "risk", "opportunity", "trend", "market", "talent"] as const;
export type InsightKind = (typeof KINDS)[number];
export const CONFIDENCE = ["high", "medium", "low"] as const;
export type Confidence = (typeof CONFIDENCE)[number];
export const HORIZONS = ["90d", "12m"] as const;
export type Horizon = (typeof HORIZONS)[number];

/** The recurring agent jobs insights runs (029 schedules). */
export const JOBS = { briefing: "insights.briefing", riskScan: "insights.risk-scan", skillsMatch: "insights.skills-match" } as const;

export const EVENTS = { recorded: "insights.insight.recorded", dismissed: "insights.insight.dismissed" } as const;
/** Ids and counts only: never the insight's text. */
export type InsightRecorded = { insightId: string; kind: InsightKind; sources: number; by: string };
export type InsightDismissed = { insightId: string; kind: InsightKind; by: string };

/** What an insight rests on, and where to see it: an amax path or an https link. */
export type InsightSource = { label: string; evidenceRef: string };

export type InsightRef = {
  id: string; kind: InsightKind; key: string | null; title: string; body: string; suggestion: string | null;
  confidence: Confidence; asOf: string; horizon: Horizon; scope: string | null; needs: string | null; data: Record<string, unknown>;
  recordedBy: string; sources: InsightSource[];
};

/** The current insights the viewer may see (none without a source), most recent first. 12m includes the 90-day ones. */
export async function currentInsights(tx: Tx, viewer: Viewer, opts: { kind?: InsightKind; horizon?: Horizon } = {}): Promise<InsightRef[]> {
  if (!can(viewer, "insights:read")) throw new ForbiddenError("insights:read", "insights");
  return liveInsights(tx, viewer, opts);
}
