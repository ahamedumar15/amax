type Week = { label: string; byAgent: number; byPeople: number };
const W = 560, H = 210, L = 34, R = 12, T = 12, B = 28;

// The mock's "Tickets per week": the agent's solved tickets as an area, people's as a dashed line,
// drawn on the server. A screen-reader table carries the same numbers.
export function WeekChart({ weeks }: { weeks: Week[] }) {
  const top = Math.max(10, Math.ceil(Math.max(...weeks.flatMap((w) => [w.byAgent, w.byPeople])) / 10) * 10);
  const X = (i: number) => L + (i * (W - L - R)) / Math.max(1, weeks.length - 1);
  const Y = (v: number) => T + (1 - v / top) * (H - T - B);
  const line = (vals: number[]) => vals.map((v, i) => `${i ? "L" : "M"}${X(i).toFixed(1)} ${Y(v).toFixed(1)}`).join(" ");
  const agent = weeks.map((w) => w.byAgent), people = weeks.map((w) => w.byPeople);
  const ticks = Array.from({ length: top / 10 + 1 }, (_, i) => i * 10);
  return (
    <>
      <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Tickets solved per week, by the support agent and by people" aria-describedby="weeks-data">
        <defs><linearGradient id="hd-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="var(--violet)" stopOpacity=".28" /><stop offset="1" stopColor="var(--violet)" stopOpacity="0" /></linearGradient></defs>
        {ticks.map((v) => <g key={v}><line x1={L} x2={W - R} y1={Y(v)} y2={Y(v)} stroke="var(--line)" /><text x={L - 8} y={Y(v) + 4} textAnchor="end" className="ax">{v}</text></g>)}
        {weeks.map((w, i) => <text key={w.label} x={X(i)} y={H - 8} textAnchor="middle" className="ax">{w.label}</text>)}
        <path d={`${line(agent)} L${X(agent.length - 1)} ${Y(0)} L${X(0)} ${Y(0)} Z`} fill="url(#hd-fill)" />
        <path d={line(agent)} fill="none" stroke="var(--violet)" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />
        <path d={line(people)} fill="none" stroke="var(--mint)" strokeWidth={2.4} strokeDasharray="6 6" strokeLinecap="round" />
      </svg>
      <table className="sr" id="weeks-data"><caption>Tickets solved per week</caption>
        <thead><tr><th scope="col">Week</th><th scope="col">By the agent</th><th scope="col">By people</th></tr></thead>
        <tbody>{weeks.map((w) => <tr key={w.label}><th scope="row">{w.label}</th><td>{w.byAgent}</td><td>{w.byPeople}</td></tr>)}</tbody>
      </table>
    </>
  );
}
