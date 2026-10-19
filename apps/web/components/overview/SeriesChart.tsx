import { Suspense } from "react";
import type { OverviewPanel } from "@amax/core";
import { PinButton } from "@amax/ui";
import { PanelFilters } from "./PanelFilters";

type Series = Extract<OverviewPanel, { kind: "series" }>;

const COLORS = ["#7B61FF", "#2FCB8C", "#F7B23B"];
const W = 700, H = 250, L = 44, R = 12, T = 16, B = 30;

const curve = (pts: [number, number][]) => {
  let s = `M${pts[0][0]} ${pts[0][1]}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] ?? p2;
    s += ` C${p1[0] + (p2[0] - p0[0]) / 6} ${p1[1] + (p2[1] - p0[1]) / 6} ${p2[0] - (p3[0] - p1[0]) / 6} ${p2[1] - (p3[1] - p1[1]) / 6} ${p2[0]} ${p2[1]}`;
  }
  return s;
};

const niceMax = (v: number) => { const step = v <= 40 ? 10 : v <= 100 ? 25 : 50; return { max: Math.max(step, Math.ceil(v / step) * step), step }; };

/** 068 AC-2: weekly lines, the first series solid, the rest dashed, with the numbers as a hidden table. */
export function SeriesChart({ panel }: { panel: Series }) {
  const n = panel.labels.length;
  const { max, step } = niceMax(Math.max(0, ...panel.series.flatMap((s) => s.data)));
  const X = (i: number) => L + (i * (W - L - R)) / Math.max(1, n - 1);
  const Y = (v: number) => T + (1 - v / max) * (H - T - B);
  const ticks = Array.from({ length: Math.round(max / step) + 1 }, (_, i) => i * step);
  const label = `${panel.title} per week: ${panel.series.map((s) => s.name).join(" and ")}, ${panel.labels[0]} to ${panel.labels[n - 1]}`;
  return (
    <div className="card pinnable">
      <div className="card-head"><h2>{panel.title}</h2><div className="actions"><Suspense><PanelFilters filters={panel.filters} /></Suspense><PinButton inline pin={panel.pin} /></div></div>
      <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label}>
        {ticks.map((v) => <g key={v}><line x1={L} x2={W - R} y1={Y(v)} y2={Y(v)} stroke="var(--line)" /><text x={L - 10} y={Y(v) + 4} textAnchor="end" className="ax">{v ? `${v} h` : "0"}</text></g>)}
        {panel.labels.map((l, i) => <text key={l} x={X(i)} y={H - 8} textAnchor="middle" className="ax">{l}</text>)}
        {n > 1 && panel.series.map((s, k) => {
          const d = curve(s.data.map((v, i) => [X(i), Y(v)]));
          return (
            <g key={s.name}>
              <path d={`${d} L${X(n - 1)} ${Y(0)} L${X(0)} ${Y(0)} Z`} fill={COLORS[k % 3]} opacity={k ? 0.1 : 0.16} />
              <path d={d} fill="none" stroke={COLORS[k % 3]} strokeWidth={k ? 2.2 : 3.2} strokeDasharray={k ? "6 6" : "none"} strokeLinecap="round" />
            </g>
          );
        })}
      </svg>
      <table className="sr"><caption>{label}</caption><thead><tr><th scope="col">Week</th>{panel.series.map((s) => <th key={s.name} scope="col">{s.name} (h)</th>)}</tr></thead>
        <tbody>{panel.labels.map((l, i) => <tr key={l}><th scope="row">{l}</th>{panel.series.map((s) => <td key={s.name}>{s.data[i]}</td>)}</tr>)}</tbody></table>
      <div className="legend">{panel.series.map((s, k) => <span key={s.name}><i style={{ background: k ? `repeating-linear-gradient(90deg,${COLORS[k % 3]} 0 5px,transparent 5px 9px)` : COLORS[0] }} />{s.name}</span>)}</div>
    </div>
  );
}
