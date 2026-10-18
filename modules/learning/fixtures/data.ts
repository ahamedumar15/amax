// fixtures.md: 18 programmes (11 internal, 7 external); all 184 people did the mandatory ISO 27001
// course; 126 people (68%) took part in optional programmes, averaging 74% complete against an 80%
// target; 41 certifications, 6 of them expiring before January. All of it is fictional.
export type Programme = {
  title: string; kind: "certification" | "workshop" | "compliance" | "leadership" | "course"; delivery: "internal" | "external";
  detail?: string; starts: string; ends: string; people: number; completion: number; hours: number; mandatory?: boolean;
};

export const ISO = "ISO 27001 awareness";

export const PROGRAMMES: Programme[] = [
  { title: "Azure AI Engineer cohort", kind: "certification", delivery: "external", starts: "2026-06-01", ends: "2026-11-20", people: 22, completion: 58, hours: 640 },
  { title: "Agentic engineering with MCP", kind: "workshop", delivery: "internal", detail: "Internal, 6 sessions", starts: "2026-08-03", ends: "2026-10-30", people: 38, completion: 92, hours: 456 },
  { title: ISO, kind: "compliance", delivery: "internal", detail: "Mandatory, yearly", starts: "2026-01-05", ends: "2026-03-31", people: 0, completion: 100, hours: 184, mandatory: true },
  { title: "Leading delivery teams", kind: "leadership", delivery: "internal", detail: "New managers", starts: "2026-09-07", ends: "2027-02-26", people: 9, completion: 33, hours: 108 },
  { title: "Secure coding fundamentals", kind: "course", delivery: "internal", starts: "2026-01-12", ends: "2026-03-27", people: 24, completion: 80, hours: 96 },
  { title: "Prompting and evaluation basics", kind: "workshop", delivery: "internal", starts: "2026-02-02", ends: "2026-04-24", people: 30, completion: 70, hours: 90 },
  { title: "Professional Scrum Master I", kind: "certification", delivery: "external", starts: "2026-01-19", ends: "2026-02-27", people: 5, completion: 100, hours: 80 },
  { title: "Writing clear proposals", kind: "workshop", delivery: "internal", starts: "2026-03-02", ends: "2026-03-27", people: 9, completion: 78, hours: 36 },
  { title: "ISTQB Test Automation Engineer", kind: "certification", delivery: "external", starts: "2026-03-02", ends: "2026-06-30", people: 6, completion: 67, hours: 96 },
  { title: "Accessibility (WCAG 2.2) for engineers", kind: "workshop", delivery: "internal", starts: "2026-04-06", ends: "2026-05-29", people: 18, completion: 72, hours: 90 },
  { title: "React Server Components deep dive", kind: "workshop", delivery: "internal", starts: "2026-05-04", ends: "2026-06-26", people: 16, completion: 75, hours: 96 },
  { title: "AWS Solutions Architect Associate", kind: "certification", delivery: "external", starts: "2026-05-04", ends: "2026-07-31", people: 8, completion: 75, hours: 96 },
  { title: "Kubernetes for developers", kind: "workshop", delivery: "internal", starts: "2026-06-01", ends: "2026-07-24", people: 12, completion: 70, hours: 96 },
  { title: "Presenting to clients", kind: "course", delivery: "external", starts: "2026-07-06", ends: "2026-08-28", people: 10, completion: 80, hours: 80 },
  { title: "Data engineering on Fabric", kind: "course", delivery: "external", starts: "2026-07-13", ends: "2026-09-25", people: 7, completion: 64, hours: 98 },
  { title: "Mentoring new joiners", kind: "leadership", delivery: "internal", starts: "2026-08-03", ends: "2026-09-30", people: 11, completion: 73, hours: 66 },
  { title: "Finance for delivery leads", kind: "course", delivery: "external", starts: "2026-08-10", ends: "2026-09-18", people: 6, completion: 83, hours: 36 },
  { title: "Mobile testing with Appium", kind: "workshop", delivery: "internal", starts: "2026-09-07", ends: "2026-10-09", people: 8, completion: 63, hours: 80 },
];

/** People in optional programmes with hours in each month, January to October. */
export const MONTHLY = [8, 14, 22, 19, 31, 26, 18, 34, 41, 29];
export const OPTIONAL_PEOPLE = 126;

/** `holders`: how many (a programme's completers, issued when they completed), or named employee numbers. `years`: valid that long from issue. */
export type Cert = { name: string; issuer: string; from?: string; holders: number | string[]; issued?: string; expires: string | null; years?: number };
export const CERTS: Cert[] = [
  { name: "Azure AI Engineer Associate (AI-102)", issuer: "Microsoft", from: "Azure AI Engineer cohort", holders: 12, expires: null, years: 1 },
  { name: "AWS Solutions Architect Associate", issuer: "Amazon Web Services", from: "AWS Solutions Architect Associate", holders: 6, expires: null, years: 3 },
  { name: "Professional Scrum Master I", issuer: "Scrum.org", from: "Professional Scrum Master I", holders: 5, expires: null },
  { name: "ISTQB Test Automation Engineer", issuer: "ISTQB", from: "ISTQB Test Automation Engineer", holders: 4, expires: null },
  { name: "AZ-305 Solutions Architect", issuer: "Microsoft", holders: ["LL-0233"], issued: "2024-12-02", expires: "2026-12-02" },
  { name: "ISTQB Advanced", issuer: "ISTQB", holders: ["LL-0291"], issued: "2023-12-18", expires: "2026-12-18" },
  { name: "AZ-104 Azure Administrator", issuer: "Microsoft", holders: 1, issued: "2025-12-21", expires: "2026-12-21" },
  { name: "Certified Kubernetes Application Developer", issuer: "CNCF", holders: 1, issued: "2024-12-23", expires: "2026-12-23" },
  { name: "AWS Developer Associate", issuer: "Amazon Web Services", holders: 1, issued: "2023-12-28", expires: "2026-12-28" },
  { name: "Fabric Analytics Engineer (DP-600)", issuer: "Microsoft", holders: 1, issued: "2025-12-30", expires: "2026-12-30" },
  { name: "AZ-400 DevOps Engineer", issuer: "Microsoft", holders: 3, issued: "2026-03-16", expires: "2027-03-16" },
  { name: "Certified Kubernetes Administrator", issuer: "CNCF", holders: 2, issued: "2024-08-12", expires: "2027-08-12" },
  { name: "ISO 27001 Lead Implementer", issuer: "PECB", holders: 1, issued: "2025-05-20", expires: "2028-05-20" },
  { name: "Project Management Professional", issuer: "PMI", holders: 2, issued: "2025-02-10", expires: "2028-02-10" },
];
