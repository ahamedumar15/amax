type Line = { name: string; color: string; data: (number | null)[]; area?: boolean; dashed?: boolean };

const W = 1000, H = 220, L = 44, R = 12, T = 10, B = 30;

// The mock's line chart, drawn on the server; months with no hours leave a gap. A screen-reader
// table carries the same values.
export function TrendChart({ id, label, labels, series }: { id: string; label: string; labels: string[]; series: Line[] }) {
  const n = labels.length;
  const X = (i: number) => L + (i * (W - L - R)) / Math.max(1, n - 1);
  const Y = (v: number) => T + (1 - Math.min(100, Math.max(0, v)) / 100) * (H - T - B);
  const pathOf = (data: (number | null)[]) => data.map((v, i) => (v === null ? "" : `${i && data[i - 1] !== null ? "L" : "M"}${X(i).toFixed(1)} ${Y(v).toFixed(1)}`)).join(" ");
  const last = (data: (number | null)[]) => data.findLastIndex((v) => v !== null);
  return (
    <>
      <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label} aria-describedby={`${id}-data`}>
        <defs><linearGradient id={`${id}-fill`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="var(--violet)" stopOpacity=".25" /><stop offset="1" stopColor="var(--violet)" stopOpacity="0" /></linearGradient></defs>
        {[0, 25, 50, 75, 100].map((v) => <g key={v}><line x1={L} x2={W - R} y1={Y(v)} y2={Y(v)} stroke="var(--line)" /><text x={L - 8} y={Y(v) + 4} textAnchor="end" className="ax">{v}</text></g>)}
        {labels.map((l, i) => <text key={l} x={X(i)} y={H - 8} textAnchor="middle" className="ax">{l}</text>)}
        {series.map((s) => {
          const d = pathOf(s.data), k = last(s.data), first = s.data.findIndex((v) => v !== null);
          return (
            <g key={s.name}>
              {s.area && k > first && <path d={`${pathOf(s.data.map((v, i) => (i < first || i > k ? null : v ?? 0)))} L${X(k)} ${Y(0)} L${X(first)} ${Y(0)} Z`} fill={`url(#${id}-fill)`} />}
              <path d={d} fill="none" stroke={s.color} strokeWidth={s.dashed ? 2.2 : 3} strokeDasharray={s.dashed ? "6 6" : undefined} strokeLinecap="round" strokeLinejoin="round" />
              {k >= 0 && <circle cx={X(k)} cy={Y(s.data[k]!)} r={5} fill="var(--card)" stroke={s.color} strokeWidth={2.5} />}
            </g>
          );
        })}
      </svg>
      <table className="sr" id={`${id}-data`}><caption>{label}</caption>
        <thead><tr><th scope="col">Month</th>{series.map((s) => <th scope="col" key={s.name}>{s.name}</th>)}</tr></thead>
        <tbody>{labels.map((l, i) => <tr key={l}><th scope="row">{l}</th>{series.map((s) => <td key={s.name}>{s.data[i] === null ? "No hours" : `${s.data[i]}%`}</td>)}</tr>)}</tbody>
      </table>
    </>
  );
}
