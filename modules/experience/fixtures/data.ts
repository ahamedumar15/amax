// Digital experience demo data for Lumen Labs (the 037 mock): 231 fictional devices for 184 people,
// the Oct 13 pulse (118 answers) and the readings that give each department its mock score.
export const NOTICE_ON = "2026-09-01";
export const PULSE_ON = "2026-10-13";
export const QUESTION = "How well do your laptop and apps work for you?";

/** Each department: its devices, its mock score now and four weeks ago, and its pulse answers (works well, sometimes, a lot). */
export type Dept = { name: string; devices: number; score: number; before: number; answers: [number, number, number]; group?: "other" };
export const DEPARTMENTS: Dept[] = [
  { name: "Engineering", devices: 145, score: 8.1, before: 8.1, answers: [55, 15, 2] },
  { name: "Quality", devices: 30, score: 7.1, before: 8.3, answers: [6, 6, 3] },
  { name: "Delivery", devices: 18, score: 7.9, before: 7.9, answers: [7, 2, 0] },
  { name: "Sales", devices: 11, score: 7.4, before: 7.1, answers: [4, 1, 1] },
  { name: "People and Culture", devices: 9, score: 8.3, before: 8.3, answers: [4, 1, 0] },
  { name: "Finance", devices: 6, score: 8.0, before: 8.0, answers: [3, 1, 0], group: "other" },
  { name: "IT", devices: 7, score: 8.0, before: 8.0, answers: [3, 0, 1], group: "other" },
  { name: "Leadership", devices: 5, score: 8.0, before: 8.0, answers: [2, 1, 0], group: "other" },
];

/** Fictional laptop models, handed out in turn; the 2021 one boots slowly. */
export const MODELS = ["Contoso Laptop 14 (2024)", "Fabrikam Pro 15 (2023)", "Adatum Air 13 (2025)"];
export const SLOW_MODEL = "Northwind Book 13 (2021)";

/** Special devices, by department and position among its devices. */
export const TEAMS = { app: "Teams", from: "24.9", to: "24.10", arrived: "2026-10-13", crashing: { Quality: 11, Engineering: 3 }, calm: { Engineering: 2 } };
export const VPN = { app: "VPN client", version: "5.2", department: "Delivery", devices: 4, since: "2026-10-09" };
export const SLOW = { department: "Engineering", devices: 6, bootSeconds: 260, startup: 45 };
export const BATTERY = { department: "Sales", devices: 3, pct: 52 };
export const RISKY = { department: "Engineering", devices: 4 };
export const BOOT_SECONDS = 97;

/** The app score (out of 100) of a laptop Teams keeps crashing on; the rest of its department makes up its score. */
export const SPECIAL = { teamsApp: 52 };
