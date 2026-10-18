import type { Category, Channel, Priority, QueueKey, Status } from "../contracts";

// The demo helpdesk (fictional), as in the mock: 27 open (9 waiting on the requester), the support
// agent solving 41% in October (29% in September), first response 7 min against 30, 4.7 from 212
// ratings, and the per-week and per-category figures. Times are relative to the pinned clock.
export const CLOCK = (today: string) => `${today}T10:00:00Z`;

export const QUEUE_ROWS: { key: QueueKey; name: string; prefix: string; next: number; sla: Record<Priority, [number, number]> }[] = [
  { key: "it", name: "IT", prefix: "INC", next: 20432, sla: { urgent: [10, 120], high: [15, 240], normal: [30, 4320], low: [240, 7200] } },
  { key: "hr", name: "HR", prefix: "HR", next: 1187, sla: { urgent: [30, 480], high: [60, 1440], normal: [30, 4320], low: [240, 7200] } },
  { key: "facilities", name: "Facilities", prefix: "FAC", next: 101, sla: { urgent: [30, 240], high: [60, 480], normal: [30, 4320], low: [240, 10080] } },
];

export const RESOURCES = [
  { key: "fleet-tracker-repo", name: "Fleet Tracker repo", owner: "nimal" },
  { key: "contoso-portal-repo", name: "Contoso Portal repo", owner: "maya" },
  { key: "hr-insights-repo", name: "HR Insights repo", owner: "ayesha" },
];

/** A ticket as seeded: hours before the clock it opened (and closed), who raised and handles it. */
export type Seed = {
  queue: QueueKey; number?: string; title: string; category: Category; priority?: Priority; status: Status; channel?: Channel; requester: string;
  handler?: string; openedH: number; closedH?: number; note?: string; resolution?: string; signedIn?: boolean; origin?: string; firstResponseMin?: number;
};

export const NAMED: Seed[] = [
  { queue: "it", number: "INC-20431", title: "VPN drops on home Wi-Fi", category: "Network", priority: "high", status: "open", channel: "teams", requester: "ayesha", handler: "sahan", openedH: 3.25 },
  { queue: "it", number: "INC-20429", title: "Access to Fleet Tracker repo", category: "Access", status: "resolved", requester: "tharushi", handler: "agent", openedH: 5, closedH: 2, signedIn: true,
    resolution: "Granted by support agent after Nimal Silva approved" },
  { queue: "it", number: "INC-20427", title: "Laptop for new joiner, Nov 2", category: "Hardware", status: "open", requester: "nimal", handler: "sahan", openedH: 23, note: "Created by onboarding checklist", origin: "onboarding" },
  { queue: "hr", number: "HR-1186", title: "Salary confirmation letter for visa", category: "HR letters", status: "open", requester: "kasun", handler: "agent", openedH: 40, note: "Letter drafted, waiting for HR signature" },
  { queue: "it", number: "INC-20416", title: "Teams calls drop in meeting room B", category: "Network", status: "open", requester: "dinesh", handler: "ravi", openedH: 62 },
];

const IT_OPEN: [string, Category][] = [
  ["Access to the Contoso Portal staging logs", "Access"], ["Second monitor for the QA bench", "Hardware"], ["Wi-Fi slow on the 4th floor", "Network"], ["Access to the HR Insights repo", "Access"],
  ["Docking station not charging", "Hardware"], ["Jira board for the Fleet Tracker sprint", "Other"], ["Access to the shared design drive", "Access"], ["Keyboard keys sticking", "Hardware"],
  ["Access to the build agents pool", "Access"], ["Meeting room display flickers", "Other"], ["Headset for client calls", "Hardware"], ["Access to the release dashboard", "Access"],
  ["Printer queue stuck", "Other"], ["Laptop fan very loud", "Hardware"], ["VPN profile for the Melbourne office", "Network"], ["Access to the Azure sandbox", "Access"], ["Proxy blocks the package mirror", "Network"],
];
const HR_OPEN = ["Employment letter for a bank loan", "Experience letter for a visa", "Address change on payslips", "Salary certificate for a lease", "Letter for a school admission", "Payslip copies for August"];

/** The open queue behind the named tickets: 10 IT open and 7 waiting, 4 HR open and 2 waiting. */
export const OPEN: Seed[] = [
  ...IT_OPEN.map(([title, category], i): Seed => ({ queue: "it", number: `INC-${20426 - i - (i >= 10 ? 1 : 0)}`, title, category, status: i < 10 ? "open" : "waiting", requester: ["kasun", "dinesh", "liam", "sarah", "nimal"][i % 5],
    handler: i % 2 ? "ravi" : "sahan", openedH: i < 10 ? 25 + i * 2.5 : 62 + (i - 10), channel: (["chat", "teams", "email"] as const)[i % 3] })),
  ...HR_OPEN.map((title, i): Seed => ({ queue: "hr", number: `HR-${1185 - i}`, title, category: "HR letters", status: i < 4 ? "open" : "waiting", requester: ["nimal", "ayesha", "dinesh", "tharushi", "liam", "kasun"][i],
    handler: "maya", openedH: i < 4 ? 41 + i * 2 : 50 + i })),
];

/** Tickets solved per week, by people and by the agent, on the days they closed (W36 straddles August). */
export const SOLVED: { days: string[]; people: number; agent: number }[] = [
  { days: ["2026-08-24", "2026-08-25", "2026-08-26", "2026-08-27", "2026-08-28"], people: 31, agent: 9 },
  { days: ["2026-08-31"], people: 0, agent: 7 },
  { days: ["2026-09-01", "2026-09-02", "2026-09-03", "2026-09-04"], people: 29, agent: 5 },
  { days: ["2026-09-07", "2026-09-08", "2026-09-09", "2026-09-10", "2026-09-11"], people: 33, agent: 11 },
  { days: ["2026-09-14", "2026-09-15", "2026-09-16", "2026-09-17", "2026-09-18"], people: 27, agent: 14 },
  { days: ["2026-09-21", "2026-09-22", "2026-09-23", "2026-09-24", "2026-09-25"], people: 26, agent: 16 },
  { days: ["2026-10-01", "2026-10-02"], people: 24, agent: 17 },
  { days: ["2026-10-05", "2026-10-06", "2026-10-07", "2026-10-08", "2026-10-09"], people: 25, agent: 15 },
  { days: ["2026-10-12", "2026-10-13", "2026-10-14"], people: 22, agent: 17 },
];
/** What people solved or closed as duplicates in October, so October's categories total 163. */
export const OCTOBER_PEOPLE: [Category, number][] = [["Access", 6], ["Hardware", 28], ["Network", 21], ["HR letters", 16], ["Other", 15]];
export const DUPLICATES = 15;
export const RATINGS = 212;
export const SCORES = [5, 5, 5, 5, 5, 5, 5, 5, 4, 3];
export const FIRST_RESPONSE = [3, 5, 7, 9, 11];
export const REQUESTERS = ["nimal", "kasun", "ayesha", "tharushi", "dinesh", "sarah", "liam", "maya"];
