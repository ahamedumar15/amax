import type { PinnedRecord } from "@amax/core";
import type { PinRef } from "@amax/ui";

// Insight pins name the record by its id (059); a section, stat or live figure pins the screen's view.
type InsightLike = { id: string; kind: string; title: string };
type JobLike = { id: string; title: string };

const KIND: Record<string, string> = { briefing: "Briefing", risk: "Risk", opportunity: "Opportunity", trend: "Trend", market: "Market", talent: "Talent" };
export const insightLabel = (i: InsightLike) => `${KIND[i.kind] ?? "Insight"}: ${i.title}`;
export const jobLabel = (j: JobLike) => `${j.title}, recurring agent job`;

export const insightPin = (i: InsightLike): PinRef => ({ label: insightLabel(i), tool: "get_insight", args: { insightId: i.id } });
export const jobPin = (j: JobLike): PinRef => ({ label: jobLabel(j), tool: "get_insight_job", args: { schedule: j.id } });
export const viewPin = (label: string, horizon: string): PinRef => ({ label, tool: "get_insights", args: { horizon } });

export const insightOf = (i: InsightLike | null): PinnedRecord | null => (i ? { id: i.id, label: insightLabel(i) } : null);
export const jobOf = (j: JobLike | null): PinnedRecord | null => (j ? { id: j.id, label: jobLabel(j) } : null);
