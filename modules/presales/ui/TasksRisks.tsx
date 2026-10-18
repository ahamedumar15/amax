import { facet, PinButton } from "@amax/ui";
import type { RiskRow, TaskRow } from "../server/detail";
import { AskButton } from "./AskButton";
import { day, itemPin, oppPin } from "./parts";

const TASK: Record<string, [string, string]> = { "in-progress": ["agent", "In progress"], "on-hold": ["warn", "On hold"], "to-start": ["draft", "To start"], done: ["good", "Done"] };
const KIND: Record<string, [string, string]> = { risk: ["bad", "Risk"], issue: ["bad", "Issue"], assumption: ["info", "Assumption"], decision: ["agent", "Decision"] };
const STATUS: Record<string, [string, string]> = { open: ["warn", "Open"], agreed: ["good", "Agreed"], closed: ["good", "Closed"] };
const IMPACT: Record<string, string> = { high: "High impact", medium: "Medium impact", low: "Low impact" };

function riskNote(r: RiskRow) {
  if (r.kind === "decision") return r.decidedOn ? `Decided ${day(r.decidedOn)}` : r.ownerName ? `Owner ${r.ownerName.split(" ")[0]}` : "";
  const owner = r.ownerName ? `owner ${r.ownerName.split(" ")[0]}` : "";
  return r.kind === "risk" || r.kind === "issue" ? [IMPACT[r.impact], owner].filter(Boolean).join(", ") : owner.replace(/^o/, "O");
}

const taskNote = (t: TaskRow) => [t.ownerName?.split(" ")[0], t.due && `due ${day(t.due)}`].filter(Boolean).join(", ");
type Opp = { id: string; number: string; title: string };
const head = (o: Opp, title: string) => (
  <div className="card-head"><h2>{title}</h2><PinButton inline pin={facet(oppPin(o), `, ${title.toLowerCase()}`)} /></div>
);

export function TasksCard({ opp, rows }: { opp: Opp; rows: TaskRow[] }) {
  const { number } = opp;
  return (
    <div className="card flush pinnable" id="tasks">
      {head(opp, "Tasks")}
      <div className="scroll-x"><table className="tbl"><caption className="sr">Tasks</caption><tbody>
        {rows.map((t) => (
          <tr key={t.id} className="pinnable"><td><b>{t.title}</b>{taskNote(t) && <small>{taskNote(t)}</small>}</td>
            <td><span className={`chip ${TASK[t.status][0]}`}>{TASK[t.status][1]}</span><PinButton pin={itemPin(number, `task: ${t.title}`, t.id)} /></td></tr>
        ))}
        {!rows.length && <tr><td colSpan={2}>No tasks yet.</td></tr>}
      </tbody></table></div>
    </div>
  );
}

export function RisksCard({ opp, rows, canEdit }: { opp: Opp; rows: RiskRow[]; canEdit: boolean }) {
  const { number } = opp;
  return (
    <div className="card flush pinnable" id="risks">
      {head(opp, "Risks and issues")}
      <div className="scroll-x"><table className="tbl"><caption className="sr">Risks and issues</caption><tbody>
        {rows.map((r) => {
          const pin = itemPin(number, `${r.kind}: ${r.title}`, r.id);
          return (
            <tr key={r.id} className="pinnable"><td><span className={`chip ${KIND[r.kind][0]}`}>{KIND[r.kind][1]}</span> <b>{r.title}</b><small>{riskNote(r)}</small></td>
              <td><span className={`chip ${STATUS[r.status][0]}`}>{STATUS[r.status][1]}</span>
                {canEdit && r.status === "open" && <AskButton className="btn sm ghost" label="Close" name={`Ask amax to close: ${r.title}`} prompt={`Close the ${r.kind} "${r.title}" on ${number}`} pin={pin} />}
                <PinButton pin={pin} /></td></tr>
          );
        })}
        {!rows.length && <tr><td colSpan={2}>Nothing logged yet.</td></tr>}
      </tbody></table></div>
    </div>
  );
}
