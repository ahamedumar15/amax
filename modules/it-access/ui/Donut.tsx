import { PinButton, type PinRef } from "@amax/ui";

const P = (r: number, a: number) => `${(85 + r * Math.cos(a)).toFixed(2)} ${(85 + r * Math.sin(a)).toFixed(2)}`;
const COLORS = ["#F26B5B", "#5CC8F0", "#7B61FF", "#F7D65A"];

// The mock's donut: one arc per part, a total in the middle, and a legend whose rows are pinned.
export function Donut({ label, parts, center, sub }: { label: string; parts: { name: string; value: number; shown: string; pin: PinRef }[]; center: string; sub: string }) {
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
      <ul className="donut-legend">{arcs.map((p) => <li key={p.name} className="pinnable"><i style={{ background: p.color }} />{p.name}<b>{p.shown}</b><PinButton pin={p.pin} /></li>)}</ul>
    </div>
  );
}
