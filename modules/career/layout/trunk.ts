import type { CareerEvent, GradeChange, Joined, Move } from "./events";
import { monthLabel, monthsBetween, monthYear } from "./months";

const TX = 410;
export type Tick = { label: string; y: number; grid: boolean };
export type Ring = { eventId: string; grade: string; joined: boolean; m: number; y: number; w: number };
export type Root = { eventId: string; label: string; sub: string; x: number; y: number };

const one = (v: number) => v.toFixed(1);

/** A year line each January, and the join month at the foot of the trunk. */
export function ticksOf(start: string, now: number, y: (m: number) => number): Tick[] {
  const ticks: Tick[] = [];
  for (let m = 12 - (Number(start.slice(5, 7)) - 1); m <= now; m += 12) ticks.push({ label: monthLabel(start, m).slice(4), y: y(m), grid: true });
  return [...ticks, { label: monthLabel(start, 0), y: y(0), grid: false }];
}

/** A ring at each grade; the trunk widens 4px a grade with a 3-month linear taper before each ring. */
export function ringsAndTrunk(events: CareerEvent[], start: string, now: number, y: (m: number) => number) {
  const grades = events.filter((e): e is Joined | GradeChange => e.kind === "joined" || e.kind === "grade").sort((a, b) => a.on.localeCompare(b.on));
  const rings = grades.map((g, i): Ring => {
    const m = Math.max(0, monthsBetween(start, g.on));
    return { eventId: g.id, grade: g.kind === "joined" ? g.grade : g.after, joined: g.kind === "joined", m, y: y(m), w: 8 + 4 * i };
  });
  const pts = rings.flatMap((r, i) => [[r.m, r.w], [rings[i + 1] ? rings[i + 1].m - 3 : now, r.w]]);
  const left = pts.map(([m, w]) => `${one(TX - w / 2)},${one(y(m))}`);
  const right = [...pts].reverse().map(([m, w]) => `${one(TX + w / 2)},${one(y(m))}`);
  return { rings, trunk: [...left, ...right].join(" ") };
}

const latest = (events: CareerEvent[], field: "department" | "entity") =>
  events.filter((e) => e.kind === "joined" || (e.kind === "move" && e.field === field)).sort((a, b) => a.on.localeCompare(b.on)).at(-1) as Joined | Move | undefined;

/** Department, entity and each manager, spread at equal angles below the ground line. */
export function groundAndRoots(events: CareerEvent[], foot: number) {
  const ground = foot + 24;
  const managers = events.filter((e): e is Move => e.kind === "move" && e.field === "manager").sort((a, b) => a.on.localeCompare(b.on));
  const named = (["department", "entity"] as const).flatMap((f) => {
    const e = latest(events, f);
    const label = !e ? null : e.kind === "joined" ? e[f] : e.after;
    return e && label ? [{ eventId: e.id, label, sub: f === "department" ? "Department" : "Entity" }] : [];
  });
  const bosses = managers.map((m, i) => ({ eventId: m.id, label: m.after,
    sub: managers[i + 1] ? `Manager to ${monthLabel(managers[i + 1].on, -1)}` : `Manager since ${monthYear(m.on)}` }));
  const all = [...named, ...bosses];
  const roots = all.map((r, j): Root => {
    const a = ((all.length > 1 ? 195 + (j * 150) / (all.length - 1) : 270) * Math.PI) / 180;
    return { ...r, x: Number((TX + 240 * Math.cos(a)).toFixed(1)), y: Number((ground - 64 * Math.sin(a)).toFixed(1)) };
  });
  return { ground, roots };
}
