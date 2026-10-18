import type { Project, Technology } from "./events";
import { monthsBetween } from "./months";

export type Span = { key: string; eventId: string; name: string; start: number; end: number; percent: number; technologies: Technology[] };
export type Laned = Span & { side: -1 | 1; lane: number };

/** Consecutive allocated months merge into one span and a gap starts another; months after today are cut. */
export function spansOf(p: Project, start: string, now: number): Span[] {
  const months = p.months.map((a) => [monthsBetween(start, a.month), a.percent] as const).filter(([m, pct]) => m >= 0 && m <= now && pct > 0).sort((a, b) => a[0] - b[0]);
  const out: Span[] = [];
  for (const [m, pct] of months) {
    const last = out.at(-1);
    if (last && m <= last.end + 1) Object.assign(last, { end: m, percent: Math.max(last.percent, pct) });
    else out.push({ key: `${p.id}:${m}`, eventId: p.id, name: p.name, start: m, end: m, percent: pct, technologies: [] });
  }
  if (out.length) out[out.length - 1].technologies = p.technologies;
  return out;
}

/** Greedy interval colouring in start order: the side with fewer active branches (alternating on a tie), then its innermost free lane. */
export function assignLanes(spans: Span[]): Laned[] {
  const out: Laned[] = [];
  let last: -1 | 1 = 1;
  for (const s of [...spans].sort((a, b) => a.start - b.start)) {
    const active = out.filter((o) => o.end >= s.start);
    const left = active.filter((o) => o.side === -1).length;
    const side: -1 | 1 = left === active.length - left ? (-last as -1 | 1) : left < active.length - left ? -1 : 1;
    last = side;
    const used = new Set(active.filter((o) => o.side === side).map((o) => o.lane));
    let lane = 1;
    while (used.has(lane)) lane++;
    out.push({ ...s, side, lane });
  }
  return out;
}
