import type { InsightRef, InsightSource } from "../contracts";
import type { Figure } from "./live";
import type { Insights } from "./views";

// A cell that opens with a formula trigger (= + - @, tab, CR) is prefixed with a quote, so Excel and
// Sheets show it as text instead of running it; every cell is quoted and inner quotes doubled.
const TRIGGER = /^[=+\-@\t\r]/;
export const csvCell = (value: string) => `"${(TRIGGER.test(value) ? `'${value}` : value).replace(/"/g, '""')}"`;
const csvText = (rows: string[][]) => rows.map((r) => r.map(csvCell).join(",")).join("\r\n");

const sources = (list: InsightSource[]) => list.map((s) => `${s.label} <${s.evidenceRef}>`).join("; ");
const row = (i: InsightRef) => [i.kind, i.title, i.body, i.suggestion ?? "", i.confidence, i.asOf, sources(i.sources)];
const live = (title: string, value: string, f: Figure<unknown>, today: string) => (f ? [["live", title, value, "", "high", today, sources(f.sources)]] : []);

/** The board pack: every insight on the screen and the live figures beside them, each with its sources. */
export function boardPackCsv(r: Insights) {
  const h = r.talent.headcount.value, c = r.talent.certifications?.value, p = r.market.pipeline?.value;
  return csvText([
    ["Kind", "Insight", "Detail", "Suggestion", "Confidence", "As of", "Sources"],
    ...[...r.briefing, ...r.risks, ...r.opportunities, ...r.trends].map(row),
    ...[r.talent.aiSkills, r.talent.promoted, r.market.position].flatMap((i) => (i ? [row(i)] : [])),
    ...live("Headcount", `${h.start} on Jan 1 to ${h.now} now`, r.talent.headcount, r.today),
    ...live("Attrition, 12 months", h.attrition === null ? "" : `${h.attrition}% (${h.leavers} left)`, r.talent.headcount, r.today),
    ...live("Certifications", c ? `${c.valid}, ${c.expiring} expire in 90 days` : "", r.talent.certifications, r.today),
    ...live("Open pipeline (USD)", p ? `${Math.round(Number(p.open))} across ${p.count} deals` : "", r.market.pipeline, r.today),
  ]);
}
