// Server-rendered SVG charts with a screen-reader table, drawn like the mock's line and donut.
export const SrTable = ({ caption, head, rows }: { caption: string; head: string[]; rows: (string | number)[][] }) => (
  <table className="sr"><caption>{caption}</caption><thead><tr>{head.map((h) => <th key={h} scope="col">{h}</th>)}</tr></thead>
    <tbody>{rows.map((r) => <tr key={String(r[0])}>{r.map((c, i) => <td key={i}>{c}</td>)}</tr>)}</tbody></table>
);

/** One area series: the payroll cost by month. The axis starts near the lowest value so a change shows. */
export function CostLine({ label, labels, data, unit }: { label: string; labels: string[]; data: number[]; unit: string }) {
  const W = 560, H = 210, L = 48, R = 12, T = 10, B = 30, n = labels.length;
  const lo = Math.min(...data) * 0.96, hi = Math.max(...data) * 1.02 || 1;
  const X = (i: number) => L + (i * (W - L - R)) / Math.max(1, n - 1);
  const Y = (v: number) => T + (1 - (v - lo) / (hi - lo || 1)) * (H - T - B);
  const d = data.map((v, i) => `${i ? "L" : "M"}${X(i).toFixed(1)} ${Y(v).toFixed(1)}`).join(" ");
  return (
    <>
      <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label}>
        <defs><linearGradient id="pay-cost" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#7B61FF" stopOpacity=".25" /><stop offset="1" stopColor="#7B61FF" stopOpacity="0" /></linearGradient></defs>
        {[lo, (lo + hi) / 2, hi].map((v) => (<g key={v}><line x1={L} x2={W - R} y1={Y(v)} y2={Y(v)} stroke="var(--line)" /><text x={L - 8} y={Y(v) + 4} textAnchor="end" className="ax">{v.toFixed(1)}</text></g>))}
        {labels.map((l, i) => <text key={`${l}${i}`} x={X(i)} y={H - 8} textAnchor="middle" className="ax">{l}</text>)}
        <path d={`${d} L${X(n - 1)} ${H - B} L${X(0)} ${H - B} Z`} fill="url(#pay-cost)" />
        <path d={d} fill="none" stroke="#7B61FF" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />
        <circle cx={X(n - 1)} cy={Y(data[n - 1])} r={5} fill="var(--card)" stroke="#7B61FF" strokeWidth={2.5} />
      </svg>
      <SrTable caption={label} head={["Month", `Gross, ${unit}`]} rows={labels.map((l, i) => [l, data[i].toFixed(2)])} />
    </>
  );
}

const P = (r: number, a: number) => `${(85 + r * Math.cos(a)).toFixed(2)} ${(85 + r * Math.sin(a)).toFixed(2)}`;
const COLORS = ["#7B61FF", "#F48B9B", "#5CC8F0", "#FFB86B", "#2FB5A0", "#C3B5FF"];

export function Donut({ label, parts, center, sub }: { label: string; parts: { name: string; value: number; shown: string }[]; center: string; sub: string }) {
  const total = parts.reduce((n, p) => n + p.value, 0) || 1;
  let a0 = -Math.PI / 2;
  const arcs = parts.map((p, i) => {
    const a1 = a0 + (p.value / total) * Math.PI * 2, st = a0 + 0.025, en = Math.max(st, a1 - 0.025), big = en - st > Math.PI ? 1 : 0;
    a0 = a1;
    return { ...p, color: COLORS[i % COLORS.length], d: `M${P(78, st)} A78 78 0 ${big} 1 ${P(78, en)} L${P(48, en)} A48 48 0 ${big} 0 ${P(48, st)} Z` };
  });
  return (
    <div className="donut-wrap">
      <svg viewBox="0 0 170 170" role="img" aria-label={`${label}: ${parts.map((p) => `${p.name} ${p.shown}`).join(", ")}`}>
        {arcs.map((a) => <path key={a.name} d={a.d} fill={a.color} />)}
        <text x={85} y={84} textAnchor="middle" fontSize={19} fontWeight={600} fill="currentColor">{center}</text>
        <text x={85} y={102} textAnchor="middle" fontSize={11} fill="var(--ink-3)">{sub}</text>
      </svg>
      <ul className="donut-legend">{arcs.map((p) => <li key={p.name}><i style={{ background: p.color }} />{p.name}<b>{p.shown}</b></li>)}</ul>
    </div>
  );
}
