// The mock's smooth line chart (index.html lineChart), drawn on the server with the same geometry.
export type Series = { name: string; color: string; data: number[]; area?: boolean; dashed?: boolean };
type Props = { id: string; label: string; labels: string[]; series: Series[]; max: number; step: number; width: number; height: number; prefix?: string; unit?: string };

type Pt = [number, number];
function curve(pts: Pt[]) {
  let d = `M${pts[0][0]} ${pts[0][1]}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] ?? p2;
    d += ` C${p1[0] + (p2[0] - p0[0]) / 6} ${p1[1] + (p2[1] - p0[1]) / 6} ${p2[0] - (p3[0] - p1[0]) / 6} ${p2[1] - (p3[1] - p1[1]) / 6} ${p2[0]} ${p2[1]}`;
  }
  return d;
}

export function LineChart({ id, label, labels, series, max, step, width: W, height: H, prefix = "", unit = "" }: Props) {
  const L = prefix || unit ? 48 : 40, R = 10, T = 10, B = 30, n = labels.length;
  const X = (i: number) => L + (i * (W - L - R)) / Math.max(1, n - 1);
  const Y = (v: number) => T + (1 - v / max) * (H - T - B);
  const ticks = Array.from({ length: Math.floor(max / step) + 1 }, (_, i) => i * step);
  return (
    <>
    <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label} aria-describedby={`${id}-data`}>
      {ticks.map((v) => <g key={v}><line x1={L} x2={W - R} y1={Y(v)} y2={Y(v)} stroke="var(--line)" /><text x={L - 8} y={Y(v) + 4} textAnchor="end" className="ax">{`${prefix}${v}${unit}`}</text></g>)}
      {labels.map((l, i) => <text key={l} x={X(i)} y={H - 8} textAnchor="middle" className="ax">{l}</text>)}
      {series.map((s, k) => {
        const pts = s.data.map((v, i): Pt => [X(i), Y(v)]);
        const last = pts[n - 1];
        return (
          <g key={s.name}>
            {s.area && <><defs><linearGradient id={`${id}g${k}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={s.color} stopOpacity=".25" /><stop offset="1" stopColor={s.color} stopOpacity="0" /></linearGradient></defs>
              <path d={`${curve(pts)} L${X(n - 1)} ${Y(0)} L${X(0)} ${Y(0)} Z`} fill={`url(#${id}g${k})`} /></>}
            <path d={curve(pts)} fill="none" stroke={s.color} strokeWidth={s.dashed ? 2.2 : 3} strokeDasharray={s.dashed ? "6 6" : "none"} strokeLinecap="round" />
            <circle cx={last[0]} cy={last[1]} r={5} fill="#fff" stroke={s.color} strokeWidth={2.5} />
          </g>
        );
      })}
    </svg>
    <table className="sr" id={`${id}-data`}><caption>{label}</caption><thead><tr><th scope="col">Month</th>{series.map((s) => <th scope="col" key={s.name}>{s.name}</th>)}</tr></thead>
      <tbody>{labels.map((l, i) => <tr key={l}><th scope="row">{l}</th>{series.map((s) => <td key={s.name}>{`${prefix}${s.data[i]}${unit}`}</td>)}</tr>)}</tbody></table>
    </>
  );
}
