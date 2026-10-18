// The rest of Lumen Labs, generated so every People number in fixtures.md comes from rows:
// 184 active (171 Sri Lanka, 13 Australia), departments, 42 joiners and 14 leavers this year,
// 11 on probation (3 reviews due in October), 7 documents missing, 2 contracts ending in November.
export type Filler = {
  key: string; no: string; name: string; title: string; entity: "lk" | "au"; department: string; manager?: string;
  status: "active" | "left" | "joining"; joined: string; left?: string; contractEnds?: string; probationEnds?: string;
  fteSteps?: { from: string; fte: number }[]; missingDoc?: boolean; healthDoc?: boolean;
};

export const DEPARTMENT_FILLERS: [string, number, number][] = [
  ["Engineering", 108, 3], ["Quality", 23, 0], ["Delivery", 13, 2], ["Sales", 8, 5], ["People and Culture", 8, 0], ["Finance", 6, 1], ["IT", 5, 0], ["Leadership", 4, 0],
];
const TITLES: Record<string, string[]> = {
  Engineering: ["Software engineer", "Senior software engineer", "Associate engineer", "Tech lead"], Quality: ["QA engineer", "Senior QA engineer"],
  Delivery: ["Project manager", "Scrum master", "Business analyst"], Sales: ["Account manager", "Sales executive"], "People and Culture": ["HR partner", "Talent specialist"],
  Finance: ["Accountant", "Finance analyst"], IT: ["Systems engineer", "IT support engineer"], Leadership: ["Director of engineering", "Chief financial officer", "Head of people", "Chief operating officer"],
};
const FIRST = ["Amal", "Chamara", "Dilini", "Gayan", "Hiruni", "Isuru", "Janaka", "Kavindi", "Lahiru", "Madushani", "Nadeesha", "Oshadi", "Pasan", "Ruwan", "Sachini",
  "Thilina", "Udara", "Vihanga", "Yasith", "Zainab", "Fathima", "Ishan", "Nuwan", "Sanduni", "Chathura", "Piumi", "Roshan", "Shanika", "Tharindu", "Asela"];
const LAST = ["Perera", "Jayasinghe", "Bandara", "Gunawardena", "Herath", "Karunaratne", "Liyanage", "Mendis", "Rajapaksha", "Senanayake", "Wijeratne", "Abeysekera",
  "Dissanayake", "Ekanayake", "Gamage", "Hettiarachchi", "Kumarasinghe", "Munasinghe", "Ranasinghe", "Weerasinghe"];
const AU = ["Olivia Brown", "Jack Wilson", "Charlotte Taylor", "Noah Anderson", "Amelia Thomas", "William Martin", "Isla Thompson", "Oliver White", "Mia Harris", "Lucas Walker", "Grace Young"];

const lkName = (i: number) => `${FIRST[i % 30]} ${LAST[(13 * Math.floor(i / 30) + i) % 20]}`;
const pad = (n: number) => String(n).padStart(2, "0");
const plusMonths = (iso: string, n: number) => { const d = new Date(`${iso}T00:00:00Z`); d.setUTCMonth(d.getUTCMonth() + n); return d.toISOString().slice(0, 10); };

/** Filler joiners per month of 2026: fixtures.md's 5,4,5,4,4,4,6,4,3,3 less Tharushi (May) and Dinesh (Oct). */
const JOINERS = [5, 4, 5, 4, 3, 4, 6, 4, 3, 2];
const LEAVERS = [2, 1, 3, 1, 2, 1, 2, 1, 0, 0];
const joinDates = JOINERS.flatMap((n, m) => Array.from({ length: n }, (_, i) => `2026-${pad(m + 1)}-${m === 3 && i < 2 ? 20 + 7 * i : pad(1 + ((i * 7) % 27))}`));
const onProbation = (joined: string) => joined >= "2026-08-15" || joined === "2026-04-20" || joined === "2026-04-27";

const MISSING_DOC: Record<string, number[]> = { Engineering: [0, 5, 10], Quality: [0], Sales: [2], Delivery: [1] };
const CONTRACT_ENDS: Record<string, [number, string]> = { Finance: [1, "2026-11-30"], Sales: [6, "2026-11-15"] };
const FULL_TIME_FROM = ["2026-12-01", "2027-02-01", "2027-03-01"];

const joinedOn = (department: string, i: number, n: number) =>
  department === "Engineering" && i < joinDates.length ? joinDates[i] : `${2015 + (n % 11)}-${pad((n % 12) + 1)}-${pad(1 + (n % 27))}`;
const managerOf = (department: string, i: number) => (i > 0 ? `lead:${department}` : department === "Leadership" ? undefined : "lead:Leadership");
const fteSteps = (department: string, i: number, joined: string) =>
  department === "Engineering" && i >= 60 && i < 66 ? [{ from: joined, fte: 0.5 }, { from: FULL_TIME_FROM[Math.floor((i - 60) / 2)], fte: 1 }] : undefined;

function activeFiller(department: string, i: number, n: number, auName?: string, auNo?: string): Filler {
  const joined = joinedOn(department, i, n);
  const ends = CONTRACT_ENDS[department];
  return {
    key: `f${n}`, no: auNo ?? `LL-${1001 + n}`, name: auName ?? lkName(n), title: TITLES[department][i % TITLES[department].length],
    entity: auName ? "au" : "lk", department, status: "active", joined, manager: managerOf(department, i),
    probationEnds: department === "Engineering" && onProbation(joined) ? plusMonths(joined, 6) : undefined,
    fteSteps: fteSteps(department, i, joined), contractEnds: ends && ends[0] === i ? ends[1] : undefined,
    missingDoc: (MISSING_DOC[department] ?? []).includes(i), healthDoc: department === "Quality" && i === 3,
  };
}

const leaver = (n: number, m: number, i: number): Filler => ({
  key: `f${n}`, no: `LL-${1001 + n}`, name: lkName(n), title: "Software engineer", entity: "lk", department: i % 2 ? "Quality" : "Engineering",
  status: "left", joined: `${2018 + (n % 6)}-03-01`, left: `2026-${pad(m + 1)}-${pad(10 + i * 5)}`,
});

export function fillers(): Filler[] {
  const out: Filler[] = [];
  let au = 0;
  for (const [department, count, inAu] of DEPARTMENT_FILLERS) {
    for (let i = 0; i < count; i++) {
      const inAustralia = i < inAu;
      out.push(activeFiller(department, i, out.length, inAustralia ? AU[au] : undefined, inAustralia ? `AU-${String(20 + au++).padStart(4, "0")}` : undefined));
    }
  }
  LEAVERS.forEach((count, m) => { for (let i = 0; i < count; i++) out.push(leaver(out.length, m, i)); });
  const n = out.length;
  out.push({ key: `f${n}`, no: `LL-${1001 + n}`, name: lkName(n), title: "Sales executive", entity: "lk", department: "Sales", status: "joining", joined: "2026-11-02", manager: "lead:Sales" });
  // 055: Ravi Perera (named) takes the last IT seat. Dropping it after numbering keeps every other filler's name and number.
  const seat = out.filter((f) => f.department === "IT").at(-1);
  return out.filter((f) => f !== seat);
}
