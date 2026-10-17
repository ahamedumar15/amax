import type { ReactNode } from "react";

// The mock's chart renderers (.specclaw/mock/index.html: lineChart, barsEl, donutEl) as server-
// rendered SVG, each with a visually hidden table so screen readers get the numbers.
const curve = (pts: [number, number][]) => {
  let s = `M${pts[0][0]} ${pts[0][1]}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] ?? p2;
    s += ` C${p1[0] + (p2[0] - p0[0]) / 6} ${p1[1] + (p2[1] - p0[1]) / 6} ${p2[0] - (p3[0] - p1[0]) / 6} ${p2[1] - (p3[1] - p1[1]) / 6} ${p2[0]} ${p2[1]}`;
  }
  return s;
};

function SrTable({ caption, head, rows }: { caption: string; head: string[]; rows: (string | number)[][] }) {
  return (
    <table className="sr"><caption>{caption}</caption><thead><tr>{head.map((h, i) => <th key={i}>{h}</th>)}</tr></thead>
      <tbody>{rows.map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j}>{c}</td>)}</tr>)}</tbody></table>
  );
}

/** A null point is a week with no data: the line skips it rather than drawing a zero. */
export type Series = { name: string; color: string; data: (number | null)[]; area?: boolean; dashed?: boolean };

export function LineChart({ id, label, labels, series, max, step, width = 560, height = 210 }: { id: string; label: string; labels: string[]; series: Series[]; max: number; step: number; width?: number; height?: number }) {
  const L = 40, R = 10, T = 10, B = 30, n = labels.length;
  const X = (i: number) => L + (i * (width - L - R)) / Math.max(1, n - 1);
  const Y = (v: number) => T + (1 - v / max) * (height - T - B);
  const grid: ReactNode[] = [];
  for (let v = 0; v <= max + 1e-9; v += step) grid.push(<g key={v}><line x1={L} x2={width - R} y1={Y(v)} y2={Y(v)} stroke="var(--line)" /><text x={L - 8} y={Y(v) + 4} textAnchor="end" className="ax">{v}</text></g>);
  return (
    <>
      <svg className="chart viz" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={label}>
        {grid}
        {labels.map((l, i) => <text key={l} x={X(i)} y={height - 8} textAnchor="middle" className="ax">{l}</text>)}
        {series.map((se, k) => {
          const pts = se.data.flatMap((v, i) => (v === null ? [] : [[X(i), Y(v)] as [number, number]]));
          if (!pts.length) return null;
          const last = pts[pts.length - 1];
          return (
            <g key={se.name}>
              {se.area && <><defs><linearGradient id={`${id}g${k}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={se.color} stopOpacity=".25" /><stop offset="1" stopColor={se.color} stopOpacity="0" /></linearGradient></defs>
                <path d={`${curve(pts)} L${last[0]} ${Y(0)} L${pts[0][0]} ${Y(0)} Z`} fill={`url(#${id}g${k})`} /></>}
              <path d={curve(pts)} fill="none" stroke={se.color} strokeWidth={se.dashed ? 2.2 : 3} strokeDasharray={se.dashed ? "6 6" : "none"} strokeLinecap="round" />
              <circle cx={last[0]} cy={last[1]} r={5} fill="#fff" stroke={se.color} strokeWidth={2.5} />
            </g>
          );
        })}
      </svg>
      <SrTable caption={label} head={["", ...series.map((s) => s.name)]} rows={labels.map((l, i) => [l, ...series.map((s) => s.data[i] ?? "No data")])} />
    </>
  );
}

export function BarChart({ label, labels, values, max, color = "#D6CCFF", highlight = "#7B61FF", width = 520, height = 200 }: { label: string; labels: string[]; values: number[]; max: number; color?: string; highlight?: string; width?: number; height?: number }) {
  const L = 40, R = 8, T = 12, B = 28, n = values.length, slot = (width - L - R) / n, bw = Math.min(36, slot * 0.5);
  const Y = (x: number) => T + (1 - x / max) * (height - T - B);
  return (
    <>
      <svg className="chart viz" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={label}>
        {[0, 0.5, 1].map((f) => <g key={f}><line x1={L} x2={width - R} y1={Y(max * f)} y2={Y(max * f)} stroke="var(--line)" /><text x={L - 8} y={Y(max * f) + 4} textAnchor="end" className="ax">{Math.round(max * f)}</text></g>)}
        {values.map((x, i) => {
          const cx = L + slot * i + slot / 2, last = i === n - 1;
          return (
            <g key={i}>
              <rect x={cx - bw / 2} y={Y(x)} width={bw} height={Math.max(0, Y(0) - Y(x))} rx={8} fill={last ? highlight : color} />
              <text x={cx} y={height - 8} textAnchor="middle" className="ax">{labels[i]}</text>
              {last && <text x={cx} y={Y(x) - 8} textAnchor="middle" className="ax" fontWeight={700} fill="var(--ink)">{x}</text>}
            </g>
          );
        })}
      </svg>
      <SrTable caption={label} head={["", "Value"]} rows={labels.map((l, i) => [l, values[i]])} />
    </>
  );
}

export function Donut({ label, parts, center, sub }: { label: string; parts: { name: string; value: number; color: string }[]; center: string; sub: string }) {
  const tot = parts.reduce((a, p) => a + p.value, 0) || 1;
  const cx = 85, cy = 85, ro = 78, ri = 48;
  let a0 = -Math.PI / 2;
  const paths = parts.map((p, i) => {
    const a1 = a0 + (p.value / tot) * Math.PI * 2, g = 0.025, st = a0 + g, en = a1 - g, big = en - st > Math.PI ? 1 : 0, mid = (st + en) / 2, off = i === 0 ? 6 : 0;
    const ox = Math.cos(mid) * off, oy = Math.sin(mid) * off;
    const P = (r: number, a: number) => `${(cx + ox + r * Math.cos(a)).toFixed(2)} ${(cy + oy + r * Math.sin(a)).toFixed(2)}`;
    a0 = a1;
    return <path key={p.name} d={`M${P(ro, st)} A${ro} ${ro} 0 ${big} 1 ${P(ro, en)} L${P(ri, en)} A${ri} ${ri} 0 ${big} 0 ${P(ri, st)} Z`} fill={p.color} />;
  });
  return (
    <div className="donut-wrap">
      <svg className="viz" viewBox="0 0 170 170" role="img" aria-label={label}>
        {paths}
        <text x={85} y={84} textAnchor="middle" fontSize={19} fontWeight={600} fill="currentColor" fontFamily="Avenir Next,system-ui">{center}</text>
        <text x={85} y={102} textAnchor="middle" fontSize={11.5} fill="var(--ink-3)" fontFamily="Avenir Next,system-ui">{sub}</text>
      </svg>
      <ul className="donut-legend">
        {parts.map((p, i) => <li key={p.name} className={i === 0 ? "hl" : undefined}><i style={{ background: p.color }} />{p.name}<b>{Math.round((p.value / tot) * 100)}%</b></li>)}
      </ul>
    </div>
  );
}
