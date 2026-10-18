import { PinButton } from "@amax/ui";
import { OWNERS } from "../contracts";
import { checklistPin } from "../pins";
import type { ChecklistRow } from "../server/queries";
import { day, tint } from "./parts";
import { TaskItem } from "./TaskItem";

const GROUP: Record<string, string> = { HR: "HR", ITAdmin: "IT Admin", Manager: "Manager" };
const when = (c: ChecklistRow) => (c.kind === "joiner" ? `Joins ${day(c.startsOn)}` : `Last day ${day(c.startsOn)}`);

/** One person's checklist, its tasks grouped by owner. */
export function ChecklistCard({ c }: { c: ChecklistRow }) {
  return (
    <section className="card pinnable" aria-labelledby={`cl-${c.id}`}>
      <PinButton pin={checklistPin(c)} />
      <div className="card-head">
        <div className="who"><span className={`av ${tint(c.personId)}`} aria-hidden="true">{c.initials}</span>
          <div><h2 id={`cl-${c.id}`}>{c.personName}</h2><small>{[c.jobTitle, c.department, c.employeeNo].filter(Boolean).join(", ")}</small></div></div>
        <div className="meta">
          <span className={c.kind === "joiner" ? "chip good" : "chip"}>{when(c)}</span>
          <span className="muted">{c.completedOn ? `Complete ${day(c.completedOn)}` : `${c.done} of ${c.tasks.length} done`}</span>
        </div>
      </div>
      {OWNERS.map((o) => {
        const tasks = c.tasks.filter((t) => t.owner === o);
        if (!tasks.length) return null;
        return (
          <div key={o} className="group">
            <h3>{o === "Manager" ? c.managerName ?? GROUP[o] : GROUP[o]}</h3>
            <ul className="list">{tasks.map((t) => <TaskItem key={t.id} t={t} personName={c.personName} />)}</ul>
          </div>
        );
      })}
      {!c.tasks.length && <p className="empty-line">No template matched, so there are no tasks yet.</p>}
    </section>
  );
}
