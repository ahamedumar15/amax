// fixtures.md: capacity 140..144 and demand 138..141 (Oct to Mar), 6 on the bench in January
// (.NET 3, React 1, QA 1, Data 1), and Nimal, Kasun and Ayesha's allocations as the mock shows them.
export const MONTHS = ["2026-10-01", "2026-11-01", "2026-12-01", "2027-01-01", "2027-02-01", "2027-03-01"];
export const DEMAND = [138, 140, 141, 136, 138, 141];
export const CAPACITY = [140, 141, 142, 142, 143, 144];
export const TEAM = "Delivery team";
export const DELIVERY_MEMBERS = 7;
export const JANUARY = 3;
export const JANUARY_BENCH_SKILLS = [".NET", ".NET", "React", "QA", "Data"];
export const ENGINEERING_SKILLS = [".NET", "React", "Data", ".NET", "Mobile", "React"];
export const WORK = ["Fabrikam data platform", "Northwind claims copilot", "Woodgrove support", "Adatum integration", "Internal tools"];

export const NAMED_SKILL: Record<string, string> = { "LL-0233": ".NET", "LL-0417": ".NET", "LL-0291": "QA" };

/** [employee no., project key, percent per month Oct..Mar (0 = none)] */
export const NAMED: [string, string, number[]][] = [
  ["LL-0233", "CON", [50, 50, 50, 50, 50, 0]],
  ["LL-0233", "FLT", [50, 50, 50, 50, 50, 0]],
  ["LL-0417", "FLT", [80, 80, 80, 0, 0, 0]],
  ["LL-0417", "CON", [20, 20, 20, 0, 0, 0]],
  ["LL-0291", "CON", [50, 50, 50, 50, 50, 0]],
  ["LL-0291", "HRI", [50, 50, 70, 50, 50, 0]],
];

/** Demand not yet staffed: pipeline work the team will need people for. */
export const UNSTAFFED: [string, string, number][] = [
  ["2027-02-01", "Fabrikam data platform phase 2 (pipeline)", 2],
  ["2027-03-01", "Fabrikam data platform phase 2 (pipeline)", 4],
];

/** Percent per generic member for one month so the team total hits `target` (FTE): full FTE each, less 50-point cuts. */
export function spread(members: { id: string; fte: number; bench: boolean }[], target: number): Map<string, number> {
  const pct = new Map(members.map((m) => [m.id, m.bench ? 0 : Math.round(m.fte * 100)]));
  let slack = [...pct.values()].reduce((a, b) => a + b, 0) - Math.round(target * 100);
  if (slack < 0) throw new Error(`fixtures: not enough capacity for ${target} FTE of demand`);
  for (const m of members) {
    if (slack <= 0) break;
    if (m.bench || m.fte < 1) continue;
    const cut = Math.min(50, slack);
    pct.set(m.id, pct.get(m.id)! - cut);
    slack -= cut;
  }
  return pct;
}
