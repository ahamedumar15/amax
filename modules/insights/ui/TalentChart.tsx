type Line = { name: string; color: string; data: (number | null)[]; dashed?: boolean };
const W = 560, H = 220, L = 40, R = 12, T = 10, B = 28, TOP = 200;

// Headcount and AI-skilled people per month, drawn on the server; a screen-reader table carries the same values.
export function TalentChart({ labels, series }: { labels: string[]; series: Line[] }) {
  const X = (i: number) => L + (i * (W - L - R)) / Math.max(1, labels.length - 1);
  const Y = (v: number) => T + (1 - Math.min(TOP, Math.max(0, v)) / TOP) * (H - T - B);
  const path = (d: (number | null)[]) => d.map((v, i) => (v === null ? "" : `${i && d[i - 1] !== null ? "L" : "M"}${X(i).toFixed(1)} ${Y(v).toFixed(1)}`)).join(" ");
  const label = `Headcount and people with AI skills, ${labels[0]} to ${labels.at(-1)}`;
  return (
    <>
      <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label} aria-describedby="talent-data">
        {[0, 50, 100, 150, 200].map((v) => <g key={v}><line x1={L} x2={W - R} y1={Y(v)} y2={Y(v)} stroke="var(--line)" /><text x={L - 8} y={Y(v) + 4} textAnchor="end" className="ax">{v}</text></g>)}
        {labels.map((l, i) => <text key={l} x={X(i)} y={H - 6} textAnchor="middle" className="ax">{l}</text>)}
        {series.map((s) => <path key={s.name} d={path(s.data)} fill="none" stroke={s.color} strokeWidth={s.dashed ? 2.2 : 3} strokeDasharray={s.dashed ? "6 6" : undefined} strokeLinecap="round" strokeLinejoin="round" />)}
      </svg>
      <table className="sr" id="talent-data"><caption>{label}</caption>
        <thead><tr><th scope="col">Month</th>{series.map((s) => <th scope="col" key={s.name}>{s.name}</th>)}</tr></thead>
        <tbody>{labels.map((l, i) => <tr key={l}><th scope="row">{l}</th>{series.map((s) => <td key={s.name}>{s.data[i] ?? "Not known"}</td>)}</tr>)}</tbody>
      </table>
    </>
  );
}
