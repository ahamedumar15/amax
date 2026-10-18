export const SrTable = ({ caption, head, rows }: { caption: string; head: string[]; rows: (string | number)[][] }) => (
  <table className="sr"><caption>{caption}</caption><thead><tr>{head.map((h) => <th key={h} scope="col">{h}</th>)}</tr></thead>
    <tbody>{rows.map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j}>{c}</td>)}</tr>)}</tbody></table>
);

type BarsProps = { label: string; labels: string[]; values: number[]; max: number; target: number; unit: string; partial: boolean };

export function Bars({ label, labels, values, max, target, unit, partial }: BarsProps) {
  const W = 520, H = 200, L = 40, R = 8, T = 12, B = 28, n = values.length, slot = (W - L - R) / Math.max(1, n), bw = Math.min(36, slot * 0.5);
  const Y = (x: number) => T + (1 - Math.min(x, max) / max) * (H - T - B);
  const last = n - 1, cx = L + slot * last + slot / 2;
  return (
    <>
      <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label}>
        <defs><pattern id="fin-hatch" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="7" height="7" fill="#7B61FF" fillOpacity=".14" /><line x1="0" y1="0" x2="0" y2="7" stroke="#7B61FF" strokeWidth="3" strokeOpacity=".55" /></pattern></defs>
        {[0, 0.5, 1].map((f) => (<g key={f}><line x1={L} x2={W - R} y1={Y(max * f)} y2={Y(max * f)} stroke="var(--line)" /><text x={L - 8} y={Y(max * f) + 4} textAnchor="end" className="ax">{Math.round(max * f)}{unit}</text></g>))}
        {values.map((v, i) => {
          const x = L + slot * i + (slot - bw) / 2, hatched = partial && i === last;
          return (<g key={labels[i]}>
            <rect x={x} y={Y(v)} width={bw} height={Math.max(0, Y(0) - Y(v))} rx={10} fill={hatched ? "url(#fin-hatch)" : i === last ? "#7B61FF" : "var(--bar-dim, #D6CCFF)"} stroke={hatched ? "#7B61FF" : undefined} strokeDasharray={hatched ? "4 3" : undefined} />
            <text x={x + bw / 2} y={H - 8} textAnchor="middle" className="ax">{labels[i]}</text>
          </g>);
        })}
        <text x={cx} y={Y(values[last]) - (partial ? 20 : 8)} textAnchor="middle" className="ax strong">{values[last]}{unit}</text>
        {partial && <text x={cx} y={Y(values[last]) - 7} textAnchor="middle" className="ax">to date</text>}
        {target > 0 && <><line x1={L} x2={W - R} y1={Y(target)} y2={Y(target)} stroke="#F2A93B" strokeWidth={2} strokeDasharray="6 6" /><text x={W - R} y={Y(target) - 6} textAnchor="end" className="ax">Target {target}{unit}</text></>}
      </svg>
      <SrTable caption={label} head={["Month", "Invoiced"]} rows={labels.map((l, i) => [l, `${values[i]}${unit}${partial && i === last ? " (to date)" : ""}`])} />
    </>
  );
}

const P = (r: number, a: number) => `${(85 + r * Math.cos(a)).toFixed(2)} ${(85 + r * Math.sin(a)).toFixed(2)}`;

export function Donut({ label, parts, center, sub }: { label: string; parts: { name: string; value: number; shown: string; color: string }[]; center: string; sub: string }) {
  const total = parts.reduce((n, p) => n + p.value, 0) || 1;
  let a0 = -Math.PI / 2;
  const arcs = parts.filter((p) => p.value > 0).map((p) => {
    const a1 = a0 + (p.value / total) * Math.PI * 2, st = a0 + 0.025, en = Math.max(st, a1 - 0.025), big = en - st > Math.PI ? 1 : 0;
    a0 = a1;
    return { ...p, d: `M${P(78, st)} A78 78 0 ${big} 1 ${P(78, en)} L${P(48, en)} A48 48 0 ${big} 0 ${P(48, st)} Z` };
  });
  return (
    <div className="donut-wrap">
      <svg viewBox="0 0 170 170" role="img" aria-label={`${label}: ${parts.map((p) => `${p.name} ${p.shown}`).join(", ")}`}>
        {arcs.map((a) => <path key={a.name} d={a.d} fill={a.color} />)}
        <text x={85} y={84} textAnchor="middle" fontSize={19} fontWeight={600} fill="currentColor">{center}</text>
        <text x={85} y={102} textAnchor="middle" fontSize={11} fill="var(--ink-3)">{sub}</text>
      </svg>
      <ul className="donut-legend">{parts.map((p) => <li key={p.name}><i style={{ background: p.color }} />{p.name}<b>{p.shown}</b></li>)}</ul>
    </div>
  );
}
