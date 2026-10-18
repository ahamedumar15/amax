"use client";

import { useRef, type KeyboardEvent, type ReactNode } from "react";
import { PinButton } from "@amax/ui";
import type { CareerKind } from "../contracts";
import { monthLabel } from "../layout/months";
import { spanLabel, TX, W } from "../layout/tree";
import { eventPin } from "../pins";
import type { CareerScreen } from "../server/view";

type Props = { s: CareerScreen; selected: string | null; kinds: CareerKind[]; onSelect: (id: string) => void };
type Node = { key: string; eventId: string; y: number; pin: [number, number]; body: ReactNode };
const STEP: Record<string, number> = { ArrowUp: 1, ArrowRight: 1, ArrowDown: -1, ArrowLeft: -1 };

function nodesOf(s: CareerScreen): { roots: Node[]; rest: Node[] } {
  const t = s.tree;
  const branches = t.branches.map((b): Node => ({ key: b.key, eventId: b.eventId, y: b.y0, pin: [b.label ? b.label.x - (b.side > 0 ? 0 : 24) : b.x - 12, b.y1 + 22], body: <>
    <path className="halo" d={b.d} style={{ strokeWidth: b.width + 6 }} /><path className="branch" d={b.d} pathLength={1} style={{ strokeWidth: b.width }} />
    {b.leaves.map((l) => <g key={l.name} className="leaf"><line className="stem" x1={b.x} y1={b.y1} x2={l.cx} y2={l.cy} /><circle className={l.proposed ? "lf prop" : "lf"} cx={l.cx} cy={l.cy} r={5} style={{ fill: l.colour }}><title>{l.name}</title></circle></g>)}
    {b.label && <><text className="pj" x={b.label.x} y={b.y1 + 4} textAnchor={b.label.anchor}>{b.name}</text>
      <text className="sub" x={b.label.x} y={b.y1 + 17} textAnchor={b.label.anchor}>{spanLabel(t, b)}{b.percent < 100 ? ` · ${b.percent}%` : ""}</text></>}
  </> }));
  const rings = t.rings.map((r): Node => ({ key: r.eventId, eventId: r.eventId, y: r.y, pin: [W - 178, r.y - 12], body: <>
    <line className="ring" x1={TX - r.w / 2 - 7} y1={r.y} x2={TX + r.w / 2 + 7} y2={r.y} /><line className="leader" x1={TX + r.w / 2 + 9} y1={r.y} x2={W - 150} y2={r.y} />
    <text className="gr" x={W - 142} y={r.y + 4}>{r.grade}</text><text className="sub" x={W - 142} y={r.y + 17}>{monthLabel(t.start, r.m)}</text>
  </> }));
  const fruit = t.fruit.map((f): Node => ({ key: f.eventId, eventId: f.eventId, y: f.y, pin: [f.x + 10, f.y - 12],
    body: <rect className={f.expired ? "fruit old" : "fruit"} x={f.x - 6} y={f.y - 6} width={12} height={12} transform={`rotate(45 ${f.x} ${f.y})`} /> }));
  const roots = t.roots.map((r): Node => ({ key: `root:${r.eventId}:${r.sub}`, eventId: r.eventId, y: r.y, pin: [r.x + 8, r.y - 28], body: <>
    <line className="root" x1={TX} y1={t.ground} x2={r.x} y2={r.y} /><circle className="rn" cx={r.x} cy={r.y} r={4} />
    <text className="pj" x={r.x} y={r.y + 18} textAnchor="middle">{r.label}</text><text className="sub" x={r.x} y={r.y + 31} textAnchor="middle">{r.sub}</text>
  </> }));
  return { roots, rest: [...branches, ...rings, ...fruit] };
}

export function TreeSvg({ s, selected, kinds, onSelect }: Props) {
  const svg = useRef<SVGSVGElement>(null);
  const t = s.tree;
  const kind = new Map(s.events.map((e) => [e.id, e.kind]));
  const row = new Map(s.rows.map((r) => [r.id, r]));
  const { roots, rest } = nodesOf(s);
  const order = [...roots, ...[...rest].sort((a, b) => b.y - a.y)].map((n) => n.key);
  const keys = (e: KeyboardEvent, n: Node) => {
    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelect(n.eventId); return; }
    const at = order.indexOf(n.key);
    const to = e.key === "Home" ? 0 : e.key === "End" ? order.length - 1 : STEP[e.key] === undefined ? null : Math.min(order.length - 1, Math.max(0, at + STEP[e.key]));
    if (to === null) return;
    e.preventDefault();
    svg.current?.querySelector<SVGGElement>(`[data-i="${to}"]`)?.focus();
  };
  const draw = (n: Node) => {
    const r = row.get(n.eventId);
    const on = kinds.includes(kind.get(n.eventId) ?? "joined");
    return <g key={n.key} className="pinnable">
      <g className={`node${n.eventId === selected ? " sel" : ""}${on ? "" : " dim"}`} tabIndex={0} role="button" aria-pressed={n.eventId === selected} aria-label={s.labels[n.key] ?? r?.title}
        data-i={order.indexOf(n.key)} onClick={() => onSelect(n.eventId)} onKeyDown={(e) => keys(e, n)}>{n.body}</g>
      {r && <foreignObject x={n.pin[0]} y={n.pin[1]} width={28} height={28}><PinButton inline pin={eventPin(s.person, r)} /></foreignObject>}
    </g>;
  };
  return (
    <svg ref={svg} className="ct" viewBox={t.viewBox} role="group" aria-label={`Career tree for ${s.person.name}, ${monthLabel(t.start, 0)} to today, drawn to scale. Arrow keys move along the trunk and Enter shows a node's trace. The What changed list has the same events in date order.`}>
      {t.ticks.map((k) => <g key={k.label}>{k.grid && <line className="grid" x1={40} y1={k.y} x2={W - 150} y2={k.y} />}<text className="tick" x={40} y={k.y - 4}>{k.label}</text></g>)}
      {rest.filter((n) => t.branches.some((b) => b.key === n.key)).map(draw)}
      <polygon className="trunk" points={t.trunk} />
      {rest.filter((n) => !t.branches.some((b) => b.key === n.key)).map(draw)}
      <line className="ground" x1={40} y1={t.ground} x2={W - 40} y2={t.ground} /><text className="tick" x={TX + 14} y={t.todayY + 4}>Today</text>
      {roots.map(draw)}
      <line className="trunkroot" x1={TX} y1={t.ground - 24} x2={TX} y2={t.ground} />
    </svg>
  );
}
