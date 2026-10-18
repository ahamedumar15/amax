import { PinButton, type PinRef } from "@amax/ui";

const P = (r: number, a: number) => `${(85 + r * Math.cos(a)).toFixed(2)} ${(85 + r * Math.sin(a)).toFixed(2)}`;
const COLORS = ["#7B61FF", "#F2A93B", "#5CC8F0", "#F48B9B", "#B9EE7A", "#2FCB8C", "#F7D65A", "#9A93B8"];

// The mock's donut: one arc per category, the total in the middle, a pinned legend, and a
// screen-reader table with the counts.
export function Donut({ label, parts, sub }: { label: string; parts: { name: string; value: number; pin: PinRef }[]; sub: string }) {
  const total = parts.reduce((n, p) => n + p.value, 0);
  let a0 = -Math.PI / 2;
  const arcs = parts.map((p, i) => {
    const a1 = a0 + (p.value / (total || 1)) * Math.PI * 2, st = a0 + 0.025, en = Math.max(st, a1 - 0.025), big = en - st > Math.PI ? 1 : 0;
    a0 = a1;
    return { ...p, pct: total ? Math.round((100 * p.value) / total) : 0, color: COLORS[i % COLORS.length], d: `M${P(78, st)} A78 78 0 ${big} 1 ${P(78, en)} L${P(48, en)} A48 48 0 ${big} 0 ${P(48, st)} Z` };
  });
  return (
    <div className="donut-wrap">
      <svg viewBox="0 0 170 170" role="img" aria-label={`${label}: ${total} ${sub}`} aria-describedby="categories-data">
        {arcs.map((a) => <path key={a.name} d={a.d} fill={a.color} />)}
        <text x={85} y={84} textAnchor="middle" fontSize={19} fontWeight={600} fill="currentColor">{total}</text>
        <text x={85} y={102} textAnchor="middle" fontSize={11} fill="var(--ink-3)">{sub}</text>
      </svg>
      <ul className="donut-legend">{arcs.map((p) => <li key={p.name} className="pinnable"><i style={{ background: p.color }} aria-hidden="true" />{p.name}<b>{p.pct}%</b><PinButton pin={p.pin} /></li>)}</ul>
      <table className="sr" id="categories-data"><caption>{label}</caption>
        <thead><tr><th scope="col">Category</th><th scope="col">Tickets</th><th scope="col">Share</th></tr></thead>
        <tbody>{arcs.map((p) => <tr key={p.name}><th scope="row">{p.name}</th><td>{p.value}</td><td>{p.pct}%</td></tr>)}</tbody>
      </table>
    </div>
  );
}
