// The pipeline from fixtures.md (USD base): three open deals ($596,000 open, $280,800 weighted),
// one won and one lost in the last six months, two inbox-agent finds, Northwind's full history.
// Older closed deals give the 12-month win rate (3 of 8, 38%; 8 of 25 the year before) and the
// 64 days a won deal takes to close.

export type Step = [stage: string, at: string, chance: number, by: string, note?: string];
export type Opp = {
  number: number; client: string; country?: string; title: string; value: number; currency?: string; owner: string; lead?: string;
  service?: string; costCentre?: string; estimateDays?: number; expectedClose?: string; leadSource?: string; competing?: string; nextStep?: string;
  steps: Step[]; lost?: [reason: string, competitor?: string]; project?: string;
  activities?: [title: string, kind: string, owner: string, on: string, progress: number, note?: string][];
  tasks?: [title: string, owner: string, due: string, status: string][];
  risks?: [kind: string, title: string, impact: string, owner: string, status: string, decided?: string][];
};

const LIAM = "Liam Murphy";
const MAYA = "Maya Fernando";

export const OPEN: Opp[] = [
  { number: 139, client: "Fabrikam", country: "US", title: "Data platform, phase 2", value: 320000, owner: LIAM, lead: MAYA, service: "Data and analytics", expectedClose: "2027-01-29", leadSource: "Existing client",
    steps: [["new-idea", "2026-07-10T09:00:00Z", 10, LIAM], ["lead", "2026-07-20T09:00:00Z", 20, LIAM], ["qualified", "2026-08-28T09:00:00Z", 30, MAYA, "Phase 1 review done"]],
    activities: [["Architecture workshop", "workshop", MAYA, "2026-10-24", 20, "Target data model and ingestion"]],
    risks: [["risk", "Phase 1 data quality issues still open", "high", MAYA, "open"]] },
  { number: 142, client: "Northwind Insurance", country: "AU", title: "Claims copilot", value: 180000, owner: LIAM, lead: MAYA, service: "AI and agents", costCentre: "Northwind presales",
    estimateDays: 210, expectedClose: "2026-12-15", leadSource: "Referral", competing: "2 regional consultancies",
    nextStep: "Northwind's last two RFPs went to the vendor that showed measured results in the demo. Add the 31% faster claim triage from the Litware document-processing pilot to the demo script.",
    steps: [
      ["new-idea", "2026-08-04T09:00:00Z", 10, LIAM, "Referral from HR Insights"], ["lead", "2026-08-07T09:00:00Z", 20, LIAM], ["qualified", "2026-08-21T09:00:00Z", 30, MAYA],
      ["qualified", "2026-09-12T09:00:00Z", 40, MAYA, "Discovery workshop held"], ["proposal", "2026-10-02T09:00:00Z", 60, MAYA],
    ],
    activities: [
      ["Live demo with claims team", "demo", MAYA, "2026-10-21", 70, "Agent prepared the demo script"],
      ["Proposal submitted", "proposal", MAYA, "2026-10-02", 100, "Drafted by Claude for Maya, reviewed by Liam"],
      ["Discovery workshop", "workshop", "Nimal Silva", "2026-09-12", 100, "Claims intake, fraud checks, adjuster workload"],
      ["Intro call", "call", LIAM, "2026-08-07", 100],
    ],
    tasks: [["Prepare the demo environment", "Nimal Silva", "2026-10-20", "in-progress"], ["Security questionnaire", "Sahan Kumara", "2026-10-25", "on-hold"], ["Pricing sign-off with finance", MAYA, "2026-10-28", "to-start"]],
    risks: [["risk", "Client budget not confirmed until December", "high", LIAM, "open"], ["assumption", "Client provides the Azure tenant", "medium", "Nimal Silva", "agreed"], ["decision", "Fixed price for phase 1", "medium", MAYA, "closed", "2026-09-30"]] },
  { number: 137, client: "Contoso", country: "US", title: "Support retainer", value: 96000, owner: LIAM, service: "Managed support", expectedClose: "2026-11-07", leadSource: "Existing client",
    steps: [["new-idea", "2026-08-18T09:00:00Z", 10, LIAM], ["qualified", "2026-09-01T09:00:00Z", 40, LIAM], ["proposal", "2026-09-22T09:00:00Z", 60, LIAM], ["negotiation", "2026-10-14T09:00:00Z", 80, LIAM]] },
];

export const RECENT: Opp[] = [
  { number: 133, client: "Northwind HR", country: "AU", title: "HR Insights retainer", value: 144000, owner: "Ayesha Rahman", project: "HRI",
    steps: [["new-idea", "2026-04-01T09:00:00Z", 10, LIAM], ["proposal", "2026-05-04T09:00:00Z", 60, LIAM], ["won", "2026-06-02T09:00:00Z", 100, LIAM]] },
  { number: 136, client: "Tailspin", country: "US", title: "Mobile banking revamp", value: 150000, owner: LIAM, lost: ["Price", "Regional consultancy"],
    steps: [["new-idea", "2026-07-01T09:00:00Z", 10, LIAM], ["proposal", "2026-08-20T09:00:00Z", 50, LIAM], ["lost", "2026-09-26T09:00:00Z", 0, LIAM]] },
];

const CLIENTS = ["Litware", "Adventure Works", "Proseware", "Lucerne Publishing", "Trey Research", "Wingtip Toys", "Coho Winery", "Fourth Coffee", "Alpine Ski House", "Margie's Travel", "Blue Yonder", "Relecloud", "Humongous Insurance"];
const REASONS = ["Price", "Lost to a competitor", "No budget", "Timing", "Scope did not fit"];

const closed = (number: number, won: boolean, created: string, closedAt: string, i: number): Opp => ({
  number, client: CLIENTS[i % CLIENTS.length], title: `${["Portal", "Data", "Integration", "Mobile app", "Support"][i % 5]} engagement`, value: 40000 + (i % 7) * 15000, owner: LIAM,
  steps: [["new-idea", `${created}T09:00:00Z`, 10, LIAM], [won ? "won" : "lost", `${closedAt}T09:00:00Z`, won ? 100 : 0, LIAM]], lost: won ? undefined : [REASONS[i % REASONS.length]],
});

const day = (base: string, add: number) => new Date(Date.parse(`${base}T00:00:00Z`) + add * 86400000).toISOString().slice(0, 10);

// This year: 2 more won (58 and 72 days) and 4 lost, Nov 2025 to Mar 2026. The year before: 8 of 25 won.
export const HISTORY: Opp[] = [
  closed(101, true, "2025-09-15", day("2025-09-15", 58), 0), closed(102, true, "2025-12-01", day("2025-12-01", 72), 1),
  ...[0, 1, 2, 3].map((i) => closed(103 + i, false, day("2025-10-01", i * 30), day("2025-11-20", i * 30), i + 2)),
  ...Array.from({ length: 25 }, (_, i) => closed(107 + i, i < 8, day("2024-09-01", i * 12), day("2024-11-01", i * 12), i + 6)),
];

export const SUGGESTIONS = [
  { client: "Adatum", title: "Payday Super payroll changes", summary: "asked for a quote on Payday Super payroll changes.", value: 85000, currency: "AUD", owner: LIAM, source: "email", label: "Email to Liam, Oct 15", at: "2026-10-15T08:30:00Z" },
  { client: "Woodgrove Bank", title: "AI governance and ISO 42001 readiness", summary: "raised AI governance and ISO 42001 readiness on a call.", value: 60000, currency: "USD", owner: MAYA, source: "teams", label: "Teams, #sales-anz, Oct 16", at: "2026-10-16T04:10:00Z" },
];

export const RATES: [string, string][] = [["AUD", "0.65900000"], ["LKR", "0.00333000"], ["GBP", "1.27000000"], ["EUR", "1.08000000"]];

// Month-end pipeline ($), May to September; October is live.
export const SNAPSHOTS: [string, number, number][] = [["2026-05-01", 410000, 190000], ["2026-06-01", 455000, 215000], ["2026-07-01", 470000, 236000], ["2026-08-01", 520000, 262000], ["2026-09-01", 560000, 270000]];
