// Fictional demo hours (fixtures.md "Utilisation (Reports)"). October to date, per working day:
// [day, billable, not billable]. Week 42 matches the Time screen's sheets; the team comes to
// 222 billable of 264 available hours, 84%.
export type Day = [day: string, billable: number, other: number];

const days = (list: string[], billable: number[], other: number[]): Day[] => list.map((d, i) => [`2026-10-${d}`, billable[i], other[i]]);
const EARLY = ["01", "02", "05", "06", "07", "08", "09"];

export const OCTOBER: Record<string, Day[]> = {
  nimal: [...days(EARLY, [8, 8, 8, 8, 8, 8, 8.5], [1.5, 1.5, 1.5, 1.5, 1.5, 1.5, 1.5]), ...days(["12", "13", "14", "15"], [8, 8.5, 7, 8], [0, 0, 0, 0])],
  kasun: [...days(EARLY.slice(0, 5), [7.5, 7.5, 7.5, 7.5, 7.5], [1.6, 1.6, 1.6, 1.6, 1.6]), ...days(["12", "13", "14", "15", "16"], [8, 8, 8, 7.5, 1], [0, 0, 0, 0, 0])],
  ayesha: [...days(EARLY, [6, 6, 6, 6, 6, 5, 5.5], [3, 3, 3, 3, 3, 3, 2]), ...days(["12", "13", "15"], [7.5, 8, 8], [0, 0, 0])],
};

// The 12-month trend before October (Nov 2025 to Sep 2026), in percent: every working day each of
// the three logs that share of 8 h as billable, plus 1 h that isn't.
export const TREND: [month: string, percent: number][] = [
  ["2025-11", 72], ["2025-12", 68], ["2026-01", 74], ["2026-02", 77], ["2026-03", 79], ["2026-04", 81],
  ["2026-05", 78], ["2026-06", 83], ["2026-07", 82], ["2026-08", 80], ["2026-09", 84],
];

// The same Q4 2026 holidays as leave's country packs.
export const HOLIDAYS: Record<string, [string, string][]> = {
  LK: [["2026-10-26", "Vap Full Moon Poya Day"], ["2026-11-08", "Deepavali"], ["2026-11-24", "Il Full Moon Poya Day"], ["2026-12-23", "Unduvap Full Moon Poya Day"], ["2026-12-25", "Christmas Day"]],
  AU: [["2026-10-05", "Labour Day"], ["2026-12-25", "Christmas Day"], ["2026-12-28", "Boxing Day (additional day)"]],
};
