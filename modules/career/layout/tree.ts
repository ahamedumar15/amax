import { techColour } from "./colours";
import type { CareerEvent, Certification, Project } from "./events";
import { assignLanes, spansOf, type Laned } from "./lanes";
import { monthLabel, monthsBetween } from "./months";
import { groundAndRoots, ringsAndTrunk, ticksOf, type Ring, type Root, type Tick } from "./trunk";

export const W = 820, TX = 410, R = 10, PX = 6.4, TOP = 60.4, PITCH = 92, FIRST = 70, COMPACT_ABOVE = 4;
export const fmt = (v: number) => (Number.isInteger(v) ? String(v) : v.toFixed(1));

export type Leaf = { name: string; proposed: boolean; colour: string; cx: number; cy: number };
export type Branch = Laned & { x: number; y0: number; y1: number; width: number; d: string; leaves: Leaf[]; open: boolean; label: { x: number; anchor: "start" | "end" } | null; crosses: string[] };
export type Fruit = { eventId: string; name: string; x: number; y: number; expired: boolean; on: string | null };
export type Tree = {
  start: string; now: number; width: number; height: number; viewBox: string; compact: boolean; y: (m: number) => number;
  ticks: Tick[]; trunk: string; rings: Ring[]; branches: Branch[]; fruit: Fruit[]; ground: number; roots: Root[];
};

const leavesOf = (b: Laned, x: number, y1: number): Leaf[] => b.technologies.map((t, j, all) => {
  const a = Math.PI + ((j + 1) * Math.PI) / (all.length + 1);
  return { name: t.name, proposed: t.proposed, colour: techColour(t.name), cx: x + 16 * Math.cos(a), cy: y1 - 6 + 16 * Math.sin(a) };
});

/** A connector crosses an earlier branch on its side when that branch is further in and still active. */
const crossings = (b: Laned, drawn: Laned[]) =>
  drawn.filter((c) => c.side === b.side && c.lane < b.lane && c.start <= b.start && c.end >= b.start).map((c) => c.key);

/** The career tree drawn to scale (AC-2): pure, from events and today to geometry. */
export function layoutTree(events: CareerEvent[], today: string): Tree {
  const start = (events.find((e) => e.kind === "joined") ?? [...events].sort((a, b) => a.on.localeCompare(b.on))[0])?.on ?? today;
  const now = Math.max(0, monthsBetween(start, today));
  const y = (m: number) => Number((TOP + PX * (now - m)).toFixed(1));
  const laned = assignLanes(events.filter((e): e is Project => e.kind === "project").flatMap((p) => spansOf(p, start, now)));
  const most = Math.max(0, ...laned.map((l) => l.lane));
  const compact = most > COMPACT_ABOVE;
  const pitch = compact ? (TX - 40 - FIRST) / (most - 1) : PITCH;
  const xOf = (l: Laned) => Number((TX + l.side * (FIRST + (l.lane - 1) * pitch)).toFixed(1));
  const branches = laned.map((l, i): Branch => {
    const x = xOf(l), y0 = y(l.start), y1 = y(l.end), s = l.side;
    const d = `M${TX} ${y0.toFixed(1)} H${fmt(x - s * R)} A${R} ${R} 0 0 ${s > 0 ? 0 : 1} ${fmt(x)} ${(y0 - R).toFixed(1)} V${y1.toFixed(1)}`;
    return { ...l, x, y0, y1, d, width: 1.5 + (4 * l.percent) / 100, leaves: leavesOf(l, x, y1), open: l.end === now,
      label: compact ? null : { x: x + s * 26, anchor: s > 0 ? "start" : "end" }, crosses: crossings(l, laned.slice(0, i)) };
  });
  const fruit = events.filter((e): e is Certification => e.kind === "certification").map((c) => {
    const m = monthsBetween(start, c.on);
    const on = branches.find((b) => b.start <= m && b.end >= m) ?? null;
    return { eventId: c.id, name: c.name, x: on?.x ?? TX, y: y(m), expired: !!c.expiresOn && c.expiresOn < today, on: on?.key ?? null };
  });
  const { trunk, rings } = ringsAndTrunk(events, start, now, y);
  const { ground, roots } = groundAndRoots(events, y(0));
  const height = Math.floor(ground + 120);
  return { start, now, width: W, height, viewBox: `0 18 ${W} ${height - 18}`, compact, y, ticks: ticksOf(start, now, y), trunk, rings, branches, fruit, ground, roots };
}

export const spanLabel = (t: Tree, b: Branch) => `${monthLabel(t.start, b.start)} – ${b.open ? "today" : monthLabel(t.start, b.end)}`;
