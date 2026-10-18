import type { Viewer } from "@amax/auth";
import { HORIZONS, type Horizon, type InsightRef } from "../contracts";
import { canSwitch, recurringJobs } from "./jobs";
import { certifications, headcount, pipeline, teamUtilisation } from "./live";
import { read, settingsOf } from "./read";
import { liveInsights } from "./store";

export const RISK_TABS = ["delivery", "commercial", "people"] as const;
export type RiskTab = (typeof RISK_TABS)[number];
export const horizonOf = (raw?: string): Horizon => HORIZONS.find((h) => h === raw) ?? "90d";
export const riskTabOf = (raw?: string): RiskTab => RISK_TABS.find((t) => t === raw) ?? "delivery";

const latest = (list: InsightRef[]) => { const day = list.reduce((d, i) => (i.asOf > d ? i.asOf : d), ""); return list.filter((i) => i.asOf === day); };
const byKey = (list: InsightRef[], key: string) => list.find((i) => i.key === key) ?? null;

/** The Insights screen for a horizon, as the viewer may see it: stored insights and live figures, each with its sources. */
export async function getInsights(v: Viewer, horizon: Horizon = "90d") {
  return read(v, async (tx) => {
    const { today } = await settingsOf(tx);
    const all = await liveInsights(tx, v, { horizon });
    const of = (kind: InsightRef["kind"]) => all.filter((i) => i.kind === kind);
    const people = await headcount(tx, v, today);
    const certs = await certifications(tx, people.value.ids, today);
    const notes = certs ? [] : ["Learning isn't installed, so certifications aren't counted."];
    return {
      today, horizon, notes,
      briefing: latest(of("briefing")),
      risks: of("risk"),
      opportunities: of("opportunity"),
      trends: of("trend"),
      talent: { headcount: { ...people, value: { ...people.value, ids: undefined } }, certifications: certs, aiSkills: byKey(of("talent"), "talent:ai-skills"), promoted: byKey(of("talent"), "talent:promotions") },
      market: { position: byKey(of("market"), "market:position"), win: byKey(of("market"), "market:win-rate"), pipeline: await pipeline(tx, v), utilisation: await teamUtilisation(tx, v, today) },
      jobs: await recurringJobs(v), canSwitch: canSwitch(v),
    };
  });
}
export type Insights = Awaited<ReturnType<typeof getInsights>>;
