import type { Grid as GridData, GridPerson } from "../server/grid";
import { monthLabel } from "../server/months";

const AV = ["a1", "a2", "a3", "a4"];
const av = (name: string) => AV[[...name].reduce((n, c) => n + c.charCodeAt(0), 0) % 4];
const tone = (pct: number) => (pct >= 70 ? "c80" : "c50");

function Cell({ pct, forecast, bench }: { pct: number | null; forecast: boolean; bench: boolean }) {
  if (bench) return <td className="h"><span className="cell czero">Bench</span></td>;
  if (pct === null) return <td className="h muted">–</td>;
  return <td className="h"><span className={`cell ${tone(pct)}${forecast ? " cfc" : ""}`}>{pct}%</span></td>;
}

function Total({ total, capacity }: { total: number; capacity: number }) {
  if (total > capacity) return <td className="h"><span className="cell cover" title={`Over ${capacity}% capacity`}>{total}%<span className="sr">, over capacity</span></span></td>;
  if (total === 0 && capacity > 0) return <td className="h"><span className="cell czero">0%</span></td>;
  return <td className="h">{capacity === 0 ? <span className="muted">–</span> : <b>{total}%</b>}</td>;
}

function PersonRows({ p, months }: { p: GridPerson; months: GridData["months"] }) {
  const first = p.name.split(" ")[0];
  return (
    <>
      {p.lines.map((l, k) => (
        <tr key={`${p.personId}-${l.label}`}>
          {k === 0 ? <td><div className="who"><span className={`av sm ${av(p.name)}`} aria-hidden="true">{p.initials}</span>{p.name}</div></td> : <td className="muted indent">{p.name}</td>}
          <td>{l.label}{l.manages && <small> Manages it</small>}</td>
          {months.map((m, i) => <Cell key={m.month} pct={l.percents[i]} forecast={m.forecast} bench={k === 0 && p.totals[i] === 0 && p.capacity[i] > 0} />)}
        </tr>
      ))}
      <tr className="total"><td>{first}, total</td><td />{months.map((m, i) => <Total key={m.month} total={p.totals[i]} capacity={p.capacity[i]} />)}</tr>
    </>
  );
}

export function Grid({ grid }: { grid: GridData }) {
  return (
    <div className="scroll-x">
      <table className="tbl heat">
        <caption className="sr">People by month: each person's allocation per project, and their total</caption>
        <thead><tr><th>Person</th><th>Project</th>{grid.months.map((m) => <th key={m.month}>{monthLabel(m.month)}{m.forecast ? ", forecast" : ""}</th>)}</tr></thead>
        <tbody>{grid.people.map((p) => <PersonRows key={p.personId} p={p} months={grid.months} />)}</tbody>
      </table>
    </div>
  );
}
