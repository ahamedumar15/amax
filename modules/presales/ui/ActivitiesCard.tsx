import { activityAction } from "../actions";
import type { ActivityRow } from "../server/detail";
import { day, first, initials } from "./parts";

const KIND: Record<string, [string, string]> = { demo: ["info", "Demo"], proposal: ["agent", "Proposal"], workshop: ["", "Workshop"], call: ["", "Call"], meeting: ["", "Meeting"], email: ["", "Email"] };

export function ActivitiesCard({ number, rows, canEdit, today }: { number: string; rows: ActivityRow[]; canEdit: boolean; today: string }) {
  return (
    <div className="card flush" id="activities">
      <div className="card-head"><h2>Activities</h2>
        {canEdit && (
          <details className="add"><summary className="btn"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>Log activity</summary>
            <form className="form" action={activityAction}>
              <input type="hidden" name="number" value={number} />
              <label>What happened<input name="title" required maxLength={200} /></label>
              <div className="two"><label>Type<select className="select" name="kind">{Object.entries(KIND).map(([k, [, l]]) => <option key={k} value={k}>{l}</option>)}</select></label>
                <label>Date<input name="on" type="date" required defaultValue={today} /></label></div>
              <div className="two"><label>Owner<input name="ownerName" maxLength={120} /></label><label>Progress, %<input name="progress" type="number" min={0} max={100} defaultValue={0} /></label></div>
              <div className="actions"><button className="btn primary" type="submit">Log it</button></div>
            </form>
          </details>
        )}
      </div>
      <div className="scroll-x"><table className="tbl">
        <caption className="sr">Activities</caption>
        <thead><tr><th>Activity</th><th>Type</th><th>Owner</th><th>Date</th><th style={{ minWidth: 140 }}>Progress</th></tr></thead>
        <tbody>
          {rows.map((a) => (
            <tr key={a.id}>
              <td><b>{a.title}</b>{a.note && <small>{a.note}</small>}</td>
              <td><span className={`chip ${KIND[a.kind][0]}`}>{KIND[a.kind][1]}</span></td>
              <td><div className="who"><span className="av sm a2" aria-hidden="true">{initials(a.ownerName)}</span>{first(a.ownerName)}</div></td>
              <td>{day(a.on)}</td>
              <td><div className="row"><div className="meter" style={{ flex: 1 }}><i style={{ width: `${a.progress}%`, background: a.progress === 100 ? "var(--mint)" : "var(--violet)" }} /></div>{a.progress === 100 ? "Done" : `${a.progress}%`}</div></td>
            </tr>
          ))}
          {!rows.length && <tr><td colSpan={5}>No activities yet.</td></tr>}
        </tbody>
      </table></div>
    </div>
  );
}
