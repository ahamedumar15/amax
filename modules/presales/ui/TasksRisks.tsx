import { riskAction, taskAction } from "../actions";
import type { RiskRow, TaskRow } from "../server/detail";
import { day, initials } from "./parts";

const TASK: Record<string, [string, string]> = { "in-progress": ["agent", "In progress"], "on-hold": ["warn", "On hold"], "to-start": ["draft", "To start"], done: ["good", "Done"] };
const KIND: Record<string, [string, string]> = { risk: ["bad", "Risk"], issue: ["bad", "Issue"], assumption: ["info", "Assumption"], decision: ["agent", "Decision"] };
const STATUS: Record<string, [string, string]> = { open: ["warn", "Open"], agreed: ["good", "Agreed"], closed: ["good", "Closed"] };
const IMPACT: Record<string, string> = { high: "High impact", medium: "Medium impact", low: "Low impact" };

function riskNote(r: RiskRow) {
  if (r.kind === "decision") return r.decidedOn ? `Decided ${day(r.decidedOn)}` : r.ownerName ? `Owner ${r.ownerName.split(" ")[0]}` : "";
  const owner = r.ownerName ? `owner ${r.ownerName.split(" ")[0]}` : "";
  return r.kind === "risk" || r.kind === "issue" ? [IMPACT[r.impact], owner].filter(Boolean).join(", ") : owner.replace(/^o/, "O");
}

export function TasksCard({ number, rows, canEdit }: { number: string; rows: TaskRow[]; canEdit: boolean }) {
  return (
    <div className="card" id="tasks">
      <div className="card-head"><h2>Tasks</h2>
        {canEdit && <details className="add"><summary className="btn sm">Add task</summary>
          <form className="form" action={taskAction}><input type="hidden" name="number" value={number} />
            <label>Task<input name="title" required maxLength={200} /></label>
            <div className="two"><label>Owner<input name="ownerName" maxLength={120} /></label><label>Due<input name="due" type="date" /></label></div>
            <div className="actions"><button className="btn primary" type="submit">Add</button></div></form></details>}
      </div>
      <ul className="list">
        {rows.map((t) => <li key={t.id}><div className="l"><span className="av sm a2" aria-hidden="true">{initials(t.ownerName)}</span><div>{t.title}{t.due && <small>Due {day(t.due)}</small>}</div></div><span className={`chip ${TASK[t.status][0]}`}>{TASK[t.status][1]}</span></li>)}
        {!rows.length && <li>No tasks yet.</li>}
      </ul>
    </div>
  );
}

export function RisksCard({ number, rows, canEdit }: { number: string; rows: RiskRow[]; canEdit: boolean }) {
  return (
    <div className="card" id="risks">
      <div className="card-head"><h2>Risks and issues</h2>
        {canEdit && <details className="add"><summary className="btn sm">Add</summary>
          <form className="form" action={riskAction}><input type="hidden" name="number" value={number} />
            <div className="two"><label>Kind<select className="select" name="kind">{Object.entries(KIND).map(([k, [, l]]) => <option key={k} value={k}>{l}</option>)}</select></label>
              <label>Impact<select className="select" name="impact" defaultValue="medium"><option value="high">High</option><option value="medium">Medium</option><option value="low">Low</option></select></label></div>
            <label>Description<input name="title" required maxLength={200} /></label>
            <label>Owner<input name="ownerName" maxLength={120} /></label>
            <div className="actions"><button className="btn primary" type="submit">Add</button></div></form></details>}
      </div>
      <ul className="list">
        {rows.map((r) => (
          <li key={r.id}><div className="l"><span className={`chip ${KIND[r.kind][0]}`}>{KIND[r.kind][1]}</span><div>{r.title}<small>{riskNote(r)}</small></div></div>
            {canEdit && r.status === "open" ? (
              <form action={riskAction}><input type="hidden" name="number" value={number} /><input type="hidden" name="riskId" value={r.id} /><input type="hidden" name="status" value="closed" />
                <button className="chip warn as-btn" type="submit" title="Close it" aria-label={`Close: ${r.title}`}>Open</button></form>
            ) : <span className={`chip ${STATUS[r.status][0]}`}>{STATUS[r.status][1]}</span>}
          </li>
        ))}
        {!rows.length && <li>Nothing logged yet.</li>}
      </ul>
    </div>
  );
}
