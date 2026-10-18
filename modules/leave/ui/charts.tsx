// Server-rendered SVG charts with a screen-reader table, drawn like the mock's donut and bars.
export const SrTable = ({ caption, head, rows }: { caption: string; head: string[]; rows: (string | number)[][] }) => (
  <table className="sr"><caption>{caption}</caption><thead><tr>{head.map((h) => <th key={h} scope="col">{h}</th>)}</tr></thead>
    <tbody>{rows.map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j}>{c}</td>)}</tr>)}</tbody></table>
);

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

/** Bars per month; the last is hatched when the month isn't over yet. */
export function Bars({ label, labels, values, max, partial }: { label: string; labels: string[]; values: number[]; max: number; partial: boolean }) {
  const W = 520, H = 200, L = 40, R = 8, T = 12, B = 28, slot = (W - L - R) / Math.max(1, values.length), bw = Math.min(36, slot * 0.5);
  const Y = (x: number) => T + (1 - Math.min(x, max) / max) * (H - T - B);
  return (
    <>
      <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label}>
        <defs><pattern id="leave-hatch" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="7" height="7" fill="#7B61FF" fillOpacity=".14" /><line x1="0" y1="0" x2="0" y2="7" stroke="#7B61FF" strokeWidth="3" strokeOpacity=".55" /></pattern></defs>
        {[0, 0.5, 1].map((f) => (<g key={f}><line x1={L} x2={W - R} y1={Y(max * f)} y2={Y(max * f)} stroke="var(--line)" /><text x={L - 8} y={Y(max * f) + 4} textAnchor="end" className="ax">{Math.round(max * f)}</text></g>))}
        {values.map((v, i) => {
          const x = L + slot * i + (slot - bw) / 2, last = i === values.length - 1;
          return (<g key={i}>
            <rect x={x} y={Y(v)} width={bw} height={Y(0) - Y(v)} rx={6} fill={last ? (partial ? "url(#leave-hatch)" : "#7B61FF") : "#D6CCFF"} stroke={last && partial ? "#7B61FF" : undefined} strokeDasharray={last && partial ? "4 3" : undefined} />
            <text x={x + bw / 2} y={H - 8} textAnchor="middle" className="ax">{labels[i]}</text>
          </g>);
        })}
      </svg>
      <SrTable caption={label} head={["Month", "Days"]} rows={labels.map((l, i) => [l, values[i]])} />
    </>
  );
}
