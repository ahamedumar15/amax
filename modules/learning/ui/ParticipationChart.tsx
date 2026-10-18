// The mock's learning bars (index.html learnChart), drawn on the server with the same geometry.
export function ParticipationChart({ months, label }: { months: { month: string; people: number }[]; label: string }) {
  const W = 340, H = 200, L = 28, B = 26, T = 8, bw = 18;
  const max = Math.max(50, Math.ceil(Math.max(0, ...months.map((m) => m.people)) / 25) * 25);
  const gap = (W - L - 10) / Math.max(1, months.length);
  const Y = (v: number) => T + (1 - v / max) * (H - T - B);
  const top = months.reduce((best, m, i) => (m.people > months[best].people ? i : best), 0);
  return (
    <>
      <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label} aria-describedby="learnChart-data">
        {[0, max / 2, max].map((t) => <g key={t}><line x1={L} x2={W - 10} y1={Y(t)} y2={Y(t)} stroke="var(--line)" /><text x={L - 6} y={Y(t) + 4} textAnchor="end" className="ax">{t}</text></g>)}
        {months.map((m, i) => {
          const h = (m.people / max) * (H - T - B), cx = L + gap * i + gap / 2;
          return <g key={m.month}><rect x={cx - bw / 2} y={H - B - h} width={bw} height={h} rx={6} fill={i === top ? "#7B61FF" : "var(--l-bar-dim)"} /><text x={cx} y={H - 8} textAnchor="middle" className="ax">{m.month[0]}</text></g>;
        })}
      </svg>
      <table className="sr" id="learnChart-data"><caption>{label}</caption><thead><tr><th scope="col">Month</th><th scope="col">People</th></tr></thead>
        <tbody>{months.map((m) => <tr key={m.month}><th scope="row">{m.month}</th><td>{m.people}</td></tr>)}</tbody></table>
    </>
  );
}
