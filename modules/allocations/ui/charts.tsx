// Server-rendered SVG charts with a screen-reader table, drawn like the mock's line and donut.
type Line = { name: string; color: string; data: number[]; area?: boolean; dashed?: boolean };

export const SrTable = ({ caption, head, rows }: { caption: string; head: string[]; rows: (string | number)[][] }) => (
  <table className="sr"><caption>{caption}</caption><thead><tr>{head.map((h) => <th key={h} scope="col">{h}</th>)}</tr></thead>
    <tbody>{rows.map((r) => <tr key={String(r[0])}>{r.map((c, i) => <td key={i}>{c}</td>)}</tr>)}</tbody></table>
);

export function LineChart({ id, label, labels, series, min, max, step }: { id: string; label: string; labels: string[]; series: Line[]; min: number; max: number; step: number }) {
  const W = 560, H = 210, L = 40, R = 10, T = 10, B = 30, n = labels.length;
  const X = (i: number) => L + (i * (W - L - R)) / Math.max(1, n - 1);
  const Y = (v: number) => T + (1 - (Math.min(max, Math.max(min, v)) - min) / (max - min)) * (H - T - B);
  const ticks = Array.from({ length: Math.floor((max - min) / step) + 1 }, (_, i) => min + i * step);
  return (
    <>
      <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label}>
        <defs>{series.filter((s) => s.area).map((s) => (
          <linearGradient key={s.name} id={`${id}-${s.name}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={s.color} stopOpacity=".25" /><stop offset="1" stopColor={s.color} stopOpacity="0" /></linearGradient>))}</defs>
        {ticks.map((v) => (<g key={v}><line x1={L} x2={W - R} y1={Y(v)} y2={Y(v)} stroke="var(--line)" /><text x={L - 8} y={Y(v) + 4} textAnchor="end" className="ax">{v}</text></g>))}
        {labels.map((l, i) => <text key={l} x={X(i)} y={H - 8} textAnchor="middle" className="ax">{l}</text>)}
        {series.map((s) => {
          const d = s.data.map((v, i) => `${i ? "L" : "M"}${X(i).toFixed(1)} ${Y(v).toFixed(1)}`).join(" ");
          return (<g key={s.name}>
            {s.area && <path d={`${d} L${X(n - 1)} ${Y(min)} L${X(0)} ${Y(min)} Z`} fill={`url(#${id}-${s.name})`} />}
            <path d={d} fill="none" stroke={s.color} strokeWidth={s.dashed ? 2.2 : 3} strokeDasharray={s.dashed ? "6 6" : undefined} strokeLinecap="round" strokeLinejoin="round" />
            <circle cx={X(n - 1)} cy={Y(s.data[n - 1])} r={5} fill="var(--card)" stroke={s.color} strokeWidth={2.5} />
          </g>);
        })}
      </svg>
      <SrTable caption={label} head={["Month", ...series.map((s) => s.name)]} rows={labels.map((l, i) => [l, ...series.map((s) => s.data[i])])} />
    </>
  );
}

const P = (r: number, a: number) => `${(85 + r * Math.cos(a)).toFixed(2)} ${(85 + r * Math.sin(a)).toFixed(2)}`;

export function Donut({ label, parts, center, sub }: { label: string; parts: { name: string; value: number; color: string }[]; center: string; sub: string }) {
  const total = parts.reduce((n, p) => n + p.value, 0) || 1;
  let a0 = -Math.PI / 2;
  const arcs = parts.map((p) => {
    const a1 = a0 + (p.value / total) * Math.PI * 2, st = a0 + 0.025, en = a1 - 0.025, big = en - st > Math.PI ? 1 : 0;
    a0 = a1;
    return { ...p, d: `M${P(78, st)} A78 78 0 ${big} 1 ${P(78, en)} L${P(48, en)} A48 48 0 ${big} 0 ${P(48, st)} Z` };
  });
  return (
    <div className="donut-wrap">
      <svg viewBox="0 0 170 170" role="img" aria-label={`${label}: ${parts.map((p) => `${p.name} ${p.value}`).join(", ")}`}>
        {arcs.map((a) => <path key={a.name} d={a.d} fill={a.color} />)}
        <text x={85} y={84} textAnchor="middle" fontSize={19} fontWeight={600} fill="currentColor">{center}</text>
        <text x={85} y={102} textAnchor="middle" fontSize={11} fill="var(--ink-3)">{sub}</text>
      </svg>
      <ul className="donut-legend">{parts.map((p) => <li key={p.name}><i style={{ background: p.color }} />{p.name}<b>{p.value}</b></li>)}</ul>
    </div>
  );
}
