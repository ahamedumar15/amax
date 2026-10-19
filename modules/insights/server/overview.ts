import type { OverviewPart, OverviewTone } from "@amax/core";
import type { Viewer } from "@amax/auth";
import { currentInsights, type InsightKind } from "../contracts";
import { read } from "./read";

const TONE: Record<InsightKind, OverviewTone> = { risk: "problem", opportunity: "good", trend: "good", market: "good", talent: "info", briefing: "info" };
const day = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

// 068 AC-4: the three newest current insights, each pinned to itself, with the way to the rest.
export const insightsOverview = (v: Viewer): Promise<OverviewPart> =>
  read(v, async (tx) => {
    const top = (await currentInsights(tx, v)).filter((i) => i.kind !== "briefing").slice(0, 3);
    return {
      panels: [{ kind: "list", key: "insights.top", title: "Agent insights", slot: "aside", order: 10, href: "/insights", hrefLabel: "Open insights",
        pin: { label: "Agent insights", tool: "get_insights", args: {} },
        items: top.map((i) => ({ id: i.id, title: i.title, tone: TONE[i.kind],
          detail: `${i.sources.length} ${i.sources.length === 1 ? "source" : "sources"}; ${i.confidence} confidence; ${day(i.asOf)}`,
          pin: { label: i.title, tool: "get_insight", args: { insightId: i.id } } })) }],
    };
  });
