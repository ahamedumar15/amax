import type { TeamRow } from "../server/team";
import { approveAction, remindAction } from "../actions";
import { avatar, DAY_NAMES, hrs, initials, STATUS } from "./parts";

const csv = (rows: TeamRow[]) => encodeURIComponent([["Person", ...DAY_NAMES, "Total", "From agents", "Status"].join(","),
  ...rows.map((r) => [`"${r.personName}"`, ...r.days.map((d) => d.toFixed(1)), r.total.toFixed(1), r.agentHours.toFixed(1), r.status].join(","))].join("\n"));

function Action({ row }: { row: TeamRow }) {
  if (row.status === "approved") return <span className="muted">Locked</span>;
  if (!row.canApprove) return null;
  const submitted = row.status === "submitted";
  return (
    <form action={submitted ? approveAction : remindAction}>
      <input type="hidden" name="weekId" value={row.weekId} />
      <button className={`btn sm${submitted ? " ghost" : ""}`} type="submit" aria-label={`${submitted ? "Approve" : "Remind"} ${row.personName}`}>{submitted ? "Approve" : "Remind"}</button>
    </form>
  );
}

export function Timesheets({ rows, weekKey }: { rows: TeamRow[]; weekKey: string }) {
  const late = rows.filter((r) => (r.status === "draft" || r.status === "rejected") && r.canApprove);
  return (
    <div className="card flush" style={{ marginTop: 28 }}>
      <div className="card-head">
        <h2>Timesheets</h2>
        <div className="actions">
          {late.length > 0 && <form action={remindAction}>{late.map((r) => <input key={r.weekId} type="hidden" name="weekId" value={r.weekId} />)}<button className="btn" type="submit">Remind {late.length} {late.length === 1 ? "person" : "people"}</button></form>}
          <a className="btn" download={`timesheets-${weekKey}.csv`} href={`data:text/csv;charset=utf-8,${csv(rows)}`}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4v11m-4-4 4 4 4-4M5 20h14" /></svg>Export</a>
        </div>
      </div>
      <div className="scroll-x"><table className="tbl">
        <caption className="sr">Timesheets for {weekKey}</caption>
        <thead><tr><th>Person</th>{DAY_NAMES.map((d) => <th className="num" key={d}>{d}</th>)}<th className="num">Total</th><th>From agents</th><th>Status</th><th className="num"><span className="sr">Actions</span></th></tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.weekId}>
              <td data-label="Person"><div className="who"><span className={`av sm ${avatar(r.personName)}`}>{initials(r.personName)}</span>{r.note || r.rejectComment ? <div>{r.personName}<small>{r.rejectComment ? `Rejected: ${r.rejectComment}` : r.note}</small></div> : r.personName}</div></td>
              {r.days.map((h, i) => <td className="num" data-label={DAY_NAMES[i]} key={i}>{hrs(h)}</td>)}
              <td className="num" data-label="Total"><b>{r.total.toFixed(1)}</b></td>
              <td data-label="From agents"><span className="chip agent">{r.total ? Math.round((r.agentHours / r.total) * 100) : 0}%</span></td>
              <td data-label="Status"><span className={`chip ${STATUS[r.status][0]}`}>{STATUS[r.status][1]}</span></td>
              <td className="num" data-label=""><Action row={r} /></td>
            </tr>
          ))}
        </tbody>
      </table></div>
    </div>
  );
}
