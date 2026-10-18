import type { AllocationMonth, CareerEvent, Technology, Trace } from "../layout/events";

// Kasun Dias's fictional history before amax (AC-9), as the previous HR system recorded it. Every
// name, client and approval here is made up for the demo.
export const KASUN = "LL-0417";
export const IMPORTED_THROUGH = "2026-10-16";
export const IMPORT_SOURCE = "Previous HR system (fictional demo import)";

const id = (n: number) => `06600000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const hr = (recordedAt: string, approvedBy: string | null = null, approvedAt: string | null = null, traceRef: string | null = null): Trace => ({
  recordedBy: "HR agent", recordedFor: "Dilini Perera", recordedAt, approvedBy, approvedAt, source: { module: "hr", label: "HR employment period", href: `/hr/p/${KASUN}` }, traceRef,
});
const plan = (recordedAt: string): Trace => ({
  recordedBy: "Maya Fernando", recordedFor: null, recordedAt, approvedBy: null, approvedAt: null, source: { module: "allocations", label: "Allocation plan", href: "/allocations" }, traceRef: null,
});
const cert = (recordedAt: string): Trace => ({
  recordedBy: "Dilini Perera", recordedFor: null, recordedAt, approvedBy: null, approvedAt: null, source: { module: "learning", label: "Certification record", href: "/learning" }, traceRef: null,
});
const months = (from: string, count: number, percent: number): AllocationMonth[] => Array.from({ length: count }, (_, i) => {
  const n = Number(from.slice(0, 4)) * 12 + Number(from.slice(5, 7)) - 1 + i;
  return { month: `${Math.floor(n / 12)}-${String((n % 12) + 1).padStart(2, "0")}-01`, percent };
});
const tech = (...names: string[]): Technology[] => names.map((name) => ({ name, proposed: false }));

export const HISTORY: CareerEvent[] = [
  { id: id(1), kind: "joined", on: "2021-06-07", grade: "Associate Engineer", department: "Engineering", entity: "Lumen Labs Lanka", trace: hr("2021-06-01T09:12:00Z") },
  { id: id(2), kind: "move", field: "manager", on: "2021-06-07", before: null, after: "Nimal Silva", trace: hr("2021-06-01T09:12:00Z") },
  { id: id(3), kind: "project", on: "2021-06-01", project: "CON", name: "Contoso Portal", client: "Contoso", months: months("2021-06", 15, 100), technologies: tech("React", "TypeScript", ".NET"), trace: plan("2021-05-28T10:00:00Z") },
  { id: id(4), kind: "certification", on: "2022-05-12", name: "Azure Developer AZ-204", issuer: "Microsoft", expiresOn: "2024-05-12", trace: cert("2022-05-13T08:30:00Z") },
  { id: id(5), kind: "grade", on: "2022-07-01", before: "Associate Engineer", after: "Engineer", trace: hr("2022-06-20T11:05:00Z", "Nimal Silva", "2022-06-24T15:40:00Z", "7c2e5b18") },
  { id: id(6), kind: "project", on: "2022-09-01", project: "Northwind Claims", name: "Northwind Claims", client: "Northwind Traders", months: months("2022-09", 14, 100), technologies: tech("Python", "Azure Functions", "PostgreSQL"), trace: plan("2022-08-25T10:00:00Z") },
  { id: id(7), kind: "project", on: "2023-11-01", project: "FLT", name: "Fleet Tracker", client: "Wide World Importers", months: months("2023-11", 36, 70), technologies: tech("Go"), trace: plan("2023-10-26T10:00:00Z") },
  { id: id(8), kind: "move", field: "manager", on: "2023-11-01", before: "Nimal Silva", after: "Maya Fernando", trace: hr("2023-10-27T09:00:00Z", "Sarah Chen", "2023-10-30T08:15:00Z") },
  { id: id(9), kind: "grade", on: "2024-04-01", before: "Engineer", after: "Senior Engineer", trace: hr("2024-03-22T10:20:00Z", "Maya Fernando", "2024-03-25T14:02:00Z", "a41f09c2") },
  { id: id(10), kind: "certification", on: "2024-07-18", name: "AWS Developer Associate", issuer: "Amazon Web Services", expiresOn: "2027-07-18", trace: cert("2024-07-19T08:30:00Z") },
  { id: id(11), kind: "project", on: "2025-03-01", project: "Internal Design System", name: "Internal Design System", client: null, months: months("2025-03", 7, 20), technologies: tech("TypeScript", "Storybook"), trace: plan("2025-02-24T10:00:00Z") },
  { id: id(12), kind: "project", on: "2025-04-01", project: "Adatum claims spike", name: "Adatum claims spike", client: "Adatum", months: months("2025-04", 2, 10), technologies: tech("Python", "AWS"), trace: plan("2025-03-27T10:00:00Z") },
];

/** The agent's two unconfirmed tags on Fleet Tracker, from the linked repo (the faint leaves). */
export const PROPOSED = { id: id(13), project: "FLT", names: ["AWS", "PostgreSQL"], on: "2026-10-16", by: "Delivery agent", for: "Maya Fernando", source: "linked repo" };
