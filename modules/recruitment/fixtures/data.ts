// Recruitment demo data for Lumen Labs (fixtures.md, "Recruitment"). Every candidate, CV and email
// here is fictional. The funnel this quarter is Applied 63, Screened 41, Interviewed 19, Offered 5,
// Hired 4; the board holds Applied 22, Screening 9, Interviews 5, Offer 1, Hired this quarter 4. Hires
// are the people hr's fixtures have joining May to November, so hires per month match People.
export type RoleSeed = { key: string; title: string; department: string; openings: number; skills: string[]; agent?: string; reason?: string; opened: string };

export const ROLES: RoleSeed[] = [
  { key: "net", title: "Senior .NET engineer", department: "Engineering", openings: 2, opened: "2026-10-05T04:00:00Z", agent: "agent:resourcing", reason: "January demand on Fleet Tracker phase 2",
    skills: [".NET", "C#", "ASP.NET Core", "Azure", "SQL Server", "microservices", "mentoring"] },
  { key: "ai", title: "AI engineer", department: "Engineering", openings: 1, opened: "2026-09-21T04:00:00Z", skills: ["Python", "LLM", "RAG", "evaluation", "TypeScript", "MLOps", "vector search"] },
  { key: "qa", title: "QA engineer", department: "Quality", openings: 1, opened: "2026-09-28T04:00:00Z",
    skills: ["Playwright", "test automation", "API testing", "Selenium", "CI", "accessibility", "performance testing", "SQL", "Jira", "Cypress", "k6"] },
];

export type Seed = { name: string; role: string; stage: "applied" | "screening" | "interview" | "offer" | "rejected-screening" | "rejected-interview"; source: string; score: number; at: string };

/** The named candidates the mock shows, then generated ones, all fictional. */
export const NAMED: Seed[] = [
  { name: "Dinithi Fernando", role: "net", stage: "applied", source: "LinkedIn", score: 86, at: "2026-10-14T05:10:00Z" },
  { name: "Arjun Mehta", role: "ai", stage: "applied", source: "Careers page", score: 72, at: "2026-10-15T08:30:00Z" },
  { name: "Sachini Perera", role: "qa", stage: "screening", source: "Referral", score: 91, at: "2026-10-06T03:00:00Z" },
  { name: "Ravindu Jayasuriya", role: "ai", stage: "interview", source: "LinkedIn", score: 84, at: "2026-09-24T03:00:00Z" },
  { name: "Hasini Gunawardena", role: "net", stage: "offer", source: "Referral", score: 88, at: "2026-09-12T03:00:00Z" },
];

const FIRST = ["Kaveesha", "Minura", "Thisara", "Senuri", "Dulaj", "Hansika", "Malith", "Nethmi", "Ravisha", "Imesha", "Pathum", "Sewwandi", "Chanuka", "Dilki", "Heshan", "Anjali", "Rohan", "Priya", "Kasuni", "Yohan"];
const LAST = ["Ratnayake", "Samarawickrama", "Kodikara", "Amarasekara", "Pathirana", "Wickramaratne", "Siriwardena", "Kariyawasam", "Nanayakkara", "Jayawardena", "Fonseka"];
const SOURCES = ["LinkedIn", "Careers page", "Referral", "Job board"];
const ROLE_KEYS = ["net", "ai", "qa"];
const name = (i: number) => `${FIRST[i % FIRST.length]} ${LAST[(i * 7) % LAST.length]}`;
const at = (i: number) => `2026-10-${String(1 + (i % 15)).padStart(2, "0")}T0${3 + (i % 6)}:00:00Z`;

/** 20 more in Applied, 8 in Screening, 4 in Interviews, and 22 turned down this quarter (13 after screening, 9 after interviews). */
const MORE: [Seed["stage"], number, number][] = [["applied", 20, 70], ["screening", 8, 89], ["interview", 4, 80], ["rejected-screening", 13, 55], ["rejected-interview", 9, 68]];
export const GENERATED: Seed[] = MORE.flatMap(([stage, n, top], k) => Array.from({ length: n }, (_, j) => {
  const i = k * 20 + j;
  return { name: name(i), role: ROLE_KEYS[i % 3], stage, source: SOURCES[i % 4], score: top - ((j * 3) % 30), at: at(i) };
}));

/** Ravindu's third round is Thursday 10:00 in Colombo; the other interviews follow it. */
export const NEXT_INTERVIEW = "2026-10-22T10:00:00+05:30";
export const HASINI_OFFER = { sent: "2026-10-14T06:00:00Z", startsOn: "2026-11-16" };
/** This quarter's hires: days from application to signed offer (an average of 31); last quarter's took 40. */
export const QUARTER_DAYS = [28, 30, 33, 33];
export const PREVIOUS_DAYS = 40;
