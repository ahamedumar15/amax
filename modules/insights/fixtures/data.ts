import type { InsightInput } from "../server/write";

// Fictional insights from the mock (fixtures.md "Headcount and talent", the Insights screen). Each
// rests on at least one source with a link to its evidence. `lk`: scoped to the Sri Lankan entity.
type Seed = Omit<InsightInput, "sources" | "scope"> & { by: string; lk?: boolean; sources: [string, string][] };

const REVIEWS = "https://reviews.example/lumen-labs";
const BRIEFING = "insights.briefing", RISKS = "insights.risk-scan", MATCH = "insights.skills-match", MARKET = "insights.market";
const risk = (tab: string, key: string, title: string, percent: number, trend: string, due: string, body: string, confidence: "high" | "medium" | "low", sources: [string, string][], action: string): Seed =>
  ({ kind: "risk", key: `risk:${tab}:${key}`, title, body, confidence, asOf: "2026-10-12", data: { tab, percent, trend, due, action, project: key }, sources, by: RISKS, lk: true, ...(tab === "people" ? { needs: "hr:read" } : {}) });
const trend = (rank: number, verdict: string, title: string, body: string, confidence: "high" | "medium" | "low", asOf: string, sources: [string, string][], horizon: "90d" | "12m" = "90d"): Seed =>
  ({ kind: "trend", key: `trend:${title}`, title, body, confidence, asOf, horizon, rank, data: { verdict }, sources, by: MARKET });
const opportunity = (title: string, body: string, data: Record<string, unknown>, confidence: "high" | "medium" | "low", asOf: string, sources: [string, string][]): Seed =>
  ({ kind: "opportunity", key: `opportunity:${title}`, title, body, data, confidence, asOf, sources, by: MATCH });

export const INSIGHTS: Seed[] = [
  { kind: "briefing", title: "Fleet Tracker is drifting", body: "Velocity is down 32% for 3 sprints, the UAT rollback reopened 2 proposals, and the client hasn't joined the last 2 reviews.",
    suggestion: "a scope call this week, and add one QA engineer", confidence: "high", asOf: "2026-10-12", rank: 1, data: { signals: 1284 }, by: BRIEFING, lk: true,
    sources: [["sprint data", "/delivery/p/FLT"], ["pipeline run 1190", "/delivery/p/FLT"], ["meeting logs in amax", "/delivery/p/FLT"]] },
  { kind: "briefing", title: "You're ahead on agentic AI", body: "44 people now hold AI skills (up from 12 in January). Market demand for agentic modernisation of .NET estates is up 38% this quarter.",
    suggestion: "package a fixed-price offering", confidence: "medium", asOf: "2026-10-12", rank: 2, data: { signals: 1284 }, by: BRIEFING,
    sources: [["the skills matrix", "/learning"], ["27 RFP debriefs in amax", "/presales"], ["31 public reviews", REVIEWS]] },
  { kind: "briefing", title: "Bench risk in January", body: "6 people roll off in January with nothing planned. 3 of them match the Northwind claims-copilot opportunity.",
    suggestion: "push Northwind to signature before Dec 15", confidence: "medium", asOf: "2026-10-12", rank: 3, data: { signals: 1284 }, by: BRIEFING,
    sources: [["allocations", "/allocations"], ["the presales board", "/presales/o/PS-0142"]] },
  risk("delivery", "FLT", "Fleet Tracker", 71, "worse", "Due Nov 14", "Velocity down 32%, UAT rollback, 2 reviews skipped", "high", [["sprint data", "/delivery/p/FLT"], ["meeting logs in amax", "/delivery/p/FLT"]], "Plan recovery"),
  risk("delivery", "CON", "Contoso Portal", 34, "steady", "v2.5.0 due Nov 28", "Global search has 4 tasks left and Nimal has asked for leave Oct 27–30", "medium", [["the v2.5.0 proposals", "/delivery/p/CON"], ["leave requests", "/leave"]], "Review"),
  risk("delivery", "HRI", "HR Insights", 12, "better", "Retainer", "On time; margin 41% against a 35% target", "high", [["release dates", "/delivery/p/HRI"], ["contract margin in Finance", "/finance"]], "Open"),
  risk("commercial", "FLT", "Fleet Tracker", 48, "worse", "Time and materials", "Margin 29.6% against a 35% target, and October's $14,200 of hours is not invoiced yet", "medium", [["contract margin in Finance", "/finance"]], "Plan recovery"),
  risk("commercial", "CON", "Contoso Portal", 22, "steady", "Fixed price", "55% invoiced with v2.5.0 still to ship", "medium", [["contracts and invoices in Finance", "/finance"]], "Review"),
  risk("people", "HRI", "HR Insights", 40, "worse", "Retainer", "Ayesha Rahman is planned at 120% in December", "high", [["allocations", "/allocations"]], "Review"),
  risk("people", "CON", "Contoso Portal", 26, "steady", "v2.5.0 due Nov 28", "Nimal Silva has asked for leave Oct 27–30, the week before v2.5.0", "medium", [["leave requests", "/leave"], ["allocations", "/allocations"]], "Review"),
  opportunity("Agentic modernisation of legacy .NET", "Azure AI, .NET 9, MCP. Your delivery record: 6 projects.",
    { chip: "Demand ↑ 38%", tone: "good", fit: 14, spark: [12, 14, 15, 19, 22, 26, 31, 38], foot: "Margin potential: high", action: "Draft offering" }, "medium", "2026-10-12", [["27 RFP debriefs in amax", "/presales"], ["31 public reviews", REVIEWS]]),
  opportunity("Data platforms on Microsoft Fabric", "Fabric, Power BI, Synapse. Fabrikam phase 2 is in discovery.",
    { chip: "Demand ↑ 21%", tone: "good", fit: 9, spark: [20, 22, 21, 24, 27, 29, 30, 33], foot: "Margin potential: medium", action: "See accounts" }, "medium", "2026-10-12", [["14 client conversations logged in amax", "/presales/o/PS-0139"]]),
  opportunity("AI governance and ISO 42001 readiness", "Regulated clients are asking. You already run ISO 27001.",
    { chip: "Skills gap", tone: "warn", fit: 2, spark: [5, 6, 8, 9, 12, 15, 19, 24], foot: "Needs: 1 hire + training", action: "Plan training" }, "low", "2026-10-09", [["5 client emails", "/inbox-agent"], ["2 RFPs in amax", "/presales"]]),
  { kind: "talent", key: "talent:ai-skills", title: "People with AI skills", body: "44 people hold AI skills, up from 12 in January.", confidence: "medium", asOf: "2026-10-12",
    data: { series: [12, 14, 17, 19, 24, 28, 31, 35, 39, 44] }, by: MATCH, sources: [["the skills matrix", "/learning"]] },
  { kind: "talent", key: "talent:promotions", title: "Promoted this year", body: "23 people were promoted this year, 13% of people.", confidence: "high", asOf: "2026-10-12",
    data: { count: 23, share: 13 }, by: MATCH, sources: [["review outcomes from Keyflow", "/keyflow"]] },
  { kind: "market", key: "market:position", title: "How buyers see you against peers", body: "Share of voice from a sample of 22 firms; low confidence.", confidence: "medium", asOf: "2026-10-12",
    data: { shareOfVoice: 4.2, rank: 7, firms: 22, rating: 4.8, reviews: 31, peers: [["Delivery speed", 8.2], ["AI capability", 7.6], ["Price", 6.9], ["Brand awareness", 4.1]] }, by: MARKET,
    sources: [["27 RFP debriefs in amax", "/presales"], ["31 public reviews", REVIEWS]] },
  { kind: "market", key: "market:win-rate", title: "Win rate, 12 months", body: "3 of 8 deals closed in the 12 months to Oct 16 were won; 8 of 25 the year before.", confidence: "high", asOf: "2026-10-16",
    data: { winRate: 38, delta: 6 }, by: MARKET, sources: [["closed deals on the presales board", "/presales"]] },
  trend(1, "take-on", "Agent platforms in the enterprise", "Agent pilots came up in 18 of 40 client conversations this quarter. Fits your MCP and Azure AI work.", "medium", "2026-10-12", [["40 client conversations logged in amax", "/presales"]]),
  trend(2, "take-on", "Payday Super in Australia from July 2026", "Mid-size AU firms need payroll changes. You know the domain.", "high", "2026-10-09", [["the Australia country pack", "/payroll"], ["6 client emails", "/inbox-agent"]]),
  trend(3, "watch", "Price pressure on staff augmentation", "Rates down 9% year on year in Australia and Sri Lanka.", "medium", "2026-10-12", [["27 RFP debriefs", "/presales"], ["9 lost-bid notes in amax", "/presales"]]),
  trend(4, "skip", "Low-code app factories", "Crowded, and low margin for your profile.", "low", "2026-09-30", [["9 bid notes in amax", "/presales"]]),
  trend(5, "watch", "Sovereign AI hosting in Australia", "Public-sector buyers are starting to ask where models run. Not in your RFPs yet.", "low", "2026-10-12", [["3 public tenders", "https://tenders.example/au"]], "12m"),
];
