// Server-rendered SVG charts with a screen-reader table, drawn like the mock's hbars and gbars.
type Series = { name: string; color: string; data: number[] };

const SrTable = ({ caption, head, rows }: { caption: string; head: string[]; rows: (string | number)[][] }) => (
  <table className="sr"><caption>{caption}</caption><thead><tr>{head.map((h) => <th key={h} scope="col">{h}</th>)}</tr></thead>
    <tbody>{rows.map((r) => <tr key={String(r[0])}>{r.map((c, i) => <td key={i}>{c}</td>)}</tr>)}</tbody></table>
);

export function HBars({ label, labels, values, color = "#7B61FF" }: { label: string; labels: string[]; values: number[]; color?: string }) {
  const W = 520, H = Math.max(60, labels.length * 28), L = 150, R = 40, rh = (H - 4) / Math.max(1, values.length), bh = Math.min(18, rh * 0.62), max = Math.max(1, ...values);
  return (
    <>
      <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label}>
        {values.map((x, i) => {
          const y = 4 + rh * i + rh / 2;
          return (<g key={labels[i]}>
            <text x={0} y={y + 4} fontSize={13} fill="var(--ink)">{labels[i]}</text>
            <rect x={L} y={y - bh / 2} width={Math.max(2, ((W - L - R) * x) / max)} height={bh} rx={Math.min(5, bh / 3)} fill={color} />
            <text x={W} y={y + 4} textAnchor="end" className="ax" fontWeight={700} fill="var(--ink)">{x}</text>
          </g>);
        })}
      </svg>
      <SrTable caption={label} head={["Group", "Count"]} rows={labels.map((l, i) => [l, values[i]])} />
    </>
  );
}

export function GBars({ label, labels, series, max, step }: { label: string; labels: string[]; series: Series[]; max: number; step: number }) {
  const W = 520, H = 210, L = 36, R = 8, T = 12, B = 28, slot = (W - L - R) / Math.max(1, labels.length), bw = Math.min(14, slot * 0.3);
  const Y = (x: number) => T + (1 - x / max) * (H - T - B);
  const ticks = Array.from({ length: Math.floor(max / step) + 1 }, (_, i) => i * step);
  return (
    <>
      <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label}>
        {ticks.map((g) => (<g key={g}><line x1={L} x2={W - R} y1={Y(g)} y2={Y(g)} stroke="var(--line)" /><text x={L - 8} y={Y(g) + 4} textAnchor="end" className="ax">{g}</text></g>))}
        {labels.map((l, i) => {
          const cx = L + slot * i + slot / 2, x0 = cx - (series.length * bw + (series.length - 1) * 3) / 2;
          return (<g key={l}>
            {series.map((s, k) => s.data[i] > 0 && <rect key={s.name} x={x0 + k * (bw + 3)} y={Y(s.data[i])} width={bw} height={Y(0) - Y(s.data[i])} rx={Math.min(4, bw / 3)} fill={s.color} />)}
            <text x={cx} y={H - 8} textAnchor="middle" className="ax">{l}</text>
          </g>);
        })}
      </svg>
      <SrTable caption={label} head={["Month", ...series.map((s) => s.name)]} rows={labels.map((l, i) => [l, ...series.map((s) => s.data[i])])} />
    </>
  );
}
