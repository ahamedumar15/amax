import type { OverviewPanel } from "@amax/core";
import { PinButton } from "@amax/ui";

type Share = Extract<OverviewPanel, { kind: "share" }>;

const COLORS = ["#7B61FF", "#2FCB8C", "#F7B23B", "#5CC8F0", "#F48B9B", "#B9EE7A"];
const CX = 85, RO = 78, RI = 46;
const at = (r: number, a: number) => `${(CX + r * Math.cos(a)).toFixed(2)} ${(CX + r * Math.sin(a)).toFixed(2)}`;

function arc(a0: number, a1: number) {
  const s = a0 + 0.025, e = Math.max(s, a1 - 0.025), big = e - s > Math.PI ? 1 : 0;
  return `M${at(RO, s)} A${RO} ${RO} 0 ${big} 1 ${at(RO, e)} L${at(RI, e)} A${RI} ${RI} 0 ${big} 0 ${at(RI, s)} Z`;
}

/** 068 AC-6: a donut of shares (this week's hours by project), each part pinnable in the legend. */
export function ShareDonut({ panel }: { panel: Share }) {
  const sum = panel.parts.reduce((t, p) => t + p.value, 0);
  const pct = (v: number) => (sum ? Math.round((v / sum) * 100) : 0);
  let a = -Math.PI / 2;
  const slices = panel.parts.map((p, i) => { const a0 = a; a += sum ? (p.value / sum) * Math.PI * 2 : 0; return { p, d: arc(a0, a), color: COLORS[i % COLORS.length] }; });
  return (
    <div className="card pinnable">
      <div className="card-head"><h2>{panel.title}</h2><PinButton inline pin={panel.pin} /></div>
      {sum ? (
        <div className="donut-wrap">
          <svg viewBox="0 0 170 170" role="img" aria-label={`${panel.title}: ${panel.parts.map((p) => `${p.label} ${pct(p.value)}%`).join(", ")}`}>
            {slices.map((s) => (panel.parts.length === 1 ? <circle key={s.p.label} cx={CX} cy={CX} r={(RO + RI) / 2} fill="none" stroke={s.color} strokeWidth={RO - RI} /> : <path key={s.p.label} d={s.d} fill={s.color} />))}
            <text x={CX} y={82} textAnchor="middle" fontSize={20} fontWeight={600} fill="currentColor">{panel.total}</text>
            <text x={CX} y={101} textAnchor="middle" fontSize={11.5} fill="var(--ink-3)">{panel.caption}</text>
          </svg>
          <ul className="donut-legend">{slices.map((s) => (
            <li key={s.p.label} className="pinnable"><i style={{ background: s.color }} aria-hidden="true" />{s.p.label}<b>{s.p.value} h · {pct(s.p.value)}%</b><PinButton pin={s.p.pin} /></li>
          ))}</ul>
        </div>
      ) : <p className="muted empty-line">Nothing recorded {panel.caption} yet.</p>}
    </div>
  );
}
