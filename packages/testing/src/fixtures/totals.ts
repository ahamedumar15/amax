import { addMoney, moneyOf, type SharedFixtures } from "@amax/core";

// Cross-module totals from fixtures.md. A check runs once every module it needs is installed;
// until then it is reported as pending. Modules add their checks here as they land.
export type TotalCheck = { name: string; modules: string[]; expected: string | number; actual: (shared: SharedFixtures) => string | number };

const sum = (xs: string[]) => xs.reduce((a, x) => addMoney(a, moneyOf(x, "USD")), moneyOf(0, "USD")).amount;

export const totals: TotalCheck[] = [
  { name: "headcount = Lanka + Australia", modules: [], expected: 184, actual: (s) => s.entities.reduce((n, e) => n + e.headcount, 0) },
  { name: "departments add up to headcount", modules: [], expected: 184, actual: (s) => Object.values(s.departments).reduce((a, b) => a + b, 0) },
  { name: "contract value", modules: [], expected: "774000.0000", actual: (s) => sum(s.projects.map((p) => p.contractValue)) },
  { name: "invoiced to date", modules: [], expected: "418200.0000", actual: (s) => sum(s.projects.map((p) => p.invoiced)) },
  { name: "Maya's team on the Time screen", modules: [], expected: 5, actual: (s) => s.people.filter((p) => p.manager === "maya").length },
];

export function checkTotals(shared: SharedFixtures, installed: string[], checks = totals) {
  const ready = checks.filter((c) => c.modules.every((m) => installed.includes(m)));
  return {
    pending: checks.filter((c) => !ready.includes(c)).map((c) => c.name),
    failures: ready.map((c) => ({ name: c.name, expected: c.expected, actual: c.actual(shared) })).filter((r) => r.actual !== r.expected),
  };
}
