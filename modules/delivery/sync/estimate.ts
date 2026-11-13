// 104 AC-3: hours from commit times, one person on one proposal. Pure, so the sync and its table test share one rule.
// A person's commits less than GAP apart are one session; a session counts from LEAD before its first commit to its
// last (a lone commit is LEAD). A session that crosses midnight UTC is split by day. Each day's sessions are summed,
// rounded to a quarter hour and capped at CAP. The result is an estimate for the person to accept or correct, never a
// logged entry (AC-4).

export const GAP_MS = 90 * 60_000;
export const LEAD_MS = 30 * 60_000;
export const CAP_HOURS = 8;
const DAY_MS = 86_400_000;

export type DayEstimate = { day: string; hours: number; commits: number };

const dayOf = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const quarter = (h: number) => Math.round(h * 4) / 4;

type Session = { from: number; to: number; commits: number };

function sessionsOf(times: number[]): Session[] {
  const out: Session[] = [];
  for (const t of [...times].sort((a, b) => a - b)) {
    const last = out.at(-1);
    if (last && t - last.to < GAP_MS) { last.to = t; last.commits++; } else out.push({ from: t - LEAD_MS, to: t, commits: 1 });
  }
  return out;
}

/** Hours per UTC day for one person's commits on one proposal; days with nothing are left out. */
export function estimateDays(commitTimes: string[]): DayEstimate[] {
  const byDay = new Map<string, { ms: number; commits: number }>();
  const add = (day: string, ms: number, commits: number) => {
    const d = byDay.get(day) ?? { ms: 0, commits: 0 };
    byDay.set(day, { ms: d.ms + ms, commits: d.commits + commits });
  };
  for (const s of sessionsOf(commitTimes.map((t) => Date.parse(t)).filter(Number.isFinite))) {
    let from = s.from;
    while (dayOf(from) !== dayOf(s.to)) {
      const midnight = Math.floor(from / DAY_MS) * DAY_MS + DAY_MS;
      add(dayOf(from), midnight - from, 0);
      from = midnight;
    }
    add(dayOf(from), s.to - from, s.commits);
  }
  return [...byDay].sort(([a], [b]) => a.localeCompare(b))
    .map(([day, d]) => ({ day, hours: Math.min(CAP_HOURS, quarter(d.ms / 3_600_000)), commits: d.commits }))
    .filter((d) => d.hours > 0);
}
