// 2026's leave so every Leave number in fixtures.md comes from rows: 620 approved days (by month 58, 49,
// 71, 88, 64, 52, 61, 79, 57, 41; by type annual 357, casual 161, medical 84, lieu 18), October's 41
// days across 19 people, 6 on leave on Oct 16 (3 annual, 2 casual, 1 medical), 2 waiting (1 clash).
import { workingDays } from "../server/days";

export type Seeded = { who: string | number; type: string; from: string; to: string; status?: "pending"; reason?: string; certificate?: string };

/** The named people's requests (a person's name) and October's filler requests (an index into the filler pool). */
export const NAMED: Seeded[] = [
  { who: "Ayesha Rahman", type: "casual", from: "2026-10-16", to: "2026-10-16" },
  { who: "Ayesha Rahman", type: "annual", from: "2026-10-19", to: "2026-10-21" },
  { who: "Kasun Dias", type: "medical", from: "2026-10-08", to: "2026-10-09", reason: "Fever (fictional demo record)", certificate: "medical-certificate-2026-10-08.pdf (fictional)" },
  { who: "Nimal Silva", type: "annual", from: "2026-10-27", to: "2026-10-30", status: "pending" },
  { who: "Tharushi Wijesinghe", type: "casual", from: "2026-11-02", to: "2026-11-02", status: "pending" },
];

const OCTOBER: [string, string, string][] = [
  ["annual", "2026-10-14", "2026-10-16"], ["annual", "2026-10-15", "2026-10-16"], ["annual", "2026-10-16", "2026-10-20"], ["casual", "2026-10-16", "2026-10-16"],
  ["medical", "2026-10-15", "2026-10-16"], ["annual", "2026-10-01", "2026-10-02"], ["annual", "2026-10-05", "2026-10-07"], ["casual", "2026-10-06", "2026-10-06"],
  ["annual", "2026-10-07", "2026-10-09"], ["medical", "2026-10-12", "2026-10-12"], ["casual", "2026-10-13", "2026-10-13"], ["annual", "2026-10-19", "2026-10-23"],
  ["lieu", "2026-10-22", "2026-10-22"], ["annual", "2026-10-27", "2026-10-29"], ["casual", "2026-10-28", "2026-10-28"], ["annual", "2026-10-29", "2026-10-30"],
  ["medical", "2026-10-02", "2026-10-02"],
];

const MONTH_DAYS = [58, 49, 71, 88, 64, 52, 61, 79, 57];
const LEFT: [string, number][] = [["annual", 328], ["casual", 156], ["medical", 78], ["lieu", 17]];
const CHUNK: Record<string, number> = { annual: 3, casual: 1, medical: 2, lieu: 1 };

/** Spreads January to September's 579 days over the types in proportion, unit by unit, so both totals are exact. */
function unitsByMonth() {
  const total = MONTH_DAYS.reduce((a, b) => a + b, 0), given = new Map<string, number>(), months: Map<string, number>[] = [];
  let i = 0;
  for (const n of MONTH_DAYS) {
    const m = new Map<string, number>();
    for (let k = 0; k < n; k++, i++) {
      const [type] = LEFT.map(([t, want]) => [t, (want * (i + 1)) / total - (given.get(t) ?? 0)] as const).sort((a, b) => b[1] - a[1])[0];
      given.set(type, (given.get(type) ?? 0) + 1);
      m.set(type, (m.get(type) ?? 0) + 1);
    }
    months.push(m);
  }
  return months;
}

/** Every filler request: October's by hand, then January to September in chunks, one person after another. */
export function fillerHistory(): Seeded[] {
  const out: Seeded[] = OCTOBER.map(([type, from, to], i) => ({ who: i, type, from, to }));
  let who = OCTOBER.length;
  unitsByMonth().forEach((units, m) => {
    const days = workingDays(`2026-${String(m + 1).padStart(2, "0")}-01`, `2026-${String(m + 1).padStart(2, "0")}-28`, new Set());
    let k = 0;
    for (const [type, n] of units) {
      for (let left = n; left > 0; left -= CHUNK[type], k++) {
        const len = Math.min(CHUNK[type], left), start = (k * 3) % (days.length - len + 1);
        out.push({ who: who++, type, from: days[start], to: days[start + len - 1] });
      }
    }
  });
  return out;
}

/** Days taken before amax went live, spread over people (smallest balances first) so unused annual leave adds up to `target`. */
export function openingTaken(bases: number[], target: number): number[] {
  let need = bases.reduce((a, b) => a + b, 0) - target;
  const out = bases.map(() => 0);
  bases.map((b, i) => [b, i]).sort((a, b) => a[0] - b[0]).forEach(([b, i], k) => {
    out[i] = Math.max(0, Math.min(b, Math.ceil(need / (bases.length - k))));
    need -= out[i];
  });
  return out;
}
