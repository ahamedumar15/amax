import { PinButton } from "@amax/ui";
import { viewPin } from "../pins";
import type { PipelineView } from "../server/queries";
import { plural } from "./parts";

const W = 520, H = 200, L = 40, R = 8, T = 12, B = 28, HL = "#7B61FF";

// Hires by the month they start, drawn like the mock's bars: the current month hatched, "to date".
export function HiresChart({ p }: { p: PipelineView }) {
  const m = p.monthly, n = m.length, max = Math.max(8, ...m.map((x) => x.hires));
  const slot = (W - L - R) / n, bw = Math.min(36, slot * 0.5), Y = (v: number) => T + (1 - v / max) * (H - T - B);
  const s = p.stats, gain = s.timeToHire !== null && s.previousTimeToHire !== null ? s.previousTimeToHire - s.timeToHire : null;
  return (
    <div className="card">
      <PinButton pin={viewPin("Hires per month", p.role?.id)} />
      <div className="card-head"><h2>Hires per month</h2>{gain !== null && <span className="up">{gain >= 0 ? "↓" : "↑"} {plural(Math.abs(gain), "day")} to hire</span>}</div>
      <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Hires per month">
        <defs><pattern id="hires-hatch" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="7" height="7" fill={HL} fillOpacity=".14" /><line x1="0" y1="0" x2="0" y2="7" stroke={HL} strokeWidth="3" strokeOpacity=".55" /></pattern></defs>
        {[0, 0.5, 1].map((f) => (<g key={f}><line x1={L} x2={W - R} y1={Y(max * f)} y2={Y(max * f)} stroke="var(--line)" /><text x={L - 8} y={Y(max * f) + 4} textAnchor="end" className="ax">{Math.round(max * f)}</text></g>))}
        {m.map((x, i) => {
          const cx = L + slot * i + slot / 2, last = i === n - 1, h = Y(0) - Y(x.hires);
          return (<g key={x.month}>
            {last ? <rect x={cx - bw / 2 + 0.75} y={Y(x.hires) + 0.75} width={bw - 1.5} height={Math.max(0, h - 1.5)} rx={Math.min(10, bw / 3)} fill="url(#hires-hatch)" stroke={HL} strokeWidth={1.5} strokeDasharray="4 3" />
              : <rect x={cx - bw / 2} y={Y(x.hires)} width={bw} height={h} rx={Math.min(10, bw / 3)} fill="var(--bar-dim)" />}
            <text x={cx} y={H - 8} textAnchor="middle" className="ax">{x.label}</text>
            {last && <><text x={cx} y={Y(x.hires) - 20} textAnchor="middle" className="ax" fontWeight={700} fill="var(--ink)">{x.hires}</text><text x={cx} y={Y(x.hires) - 7} textAnchor="middle" className="ax">to date</text></>}
          </g>);
        })}
      </svg>
      <table className="sr"><caption>Hires per month</caption><thead><tr><th scope="col">Month</th><th scope="col">Hires</th></tr></thead>
        <tbody>{m.map((x, i) => <tr key={x.month}><td>{x.label}</td><td>{x.hires}{i === n - 1 ? " (to date)" : ""}</td></tr>)}</tbody></table>
    </div>
  );
}
