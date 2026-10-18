import { PinButton, Ticket } from "@amax/ui";
import { checklistPin, viewPin } from "../pins";
import type { ChecklistRow, OnboardingSummary } from "../server/queries";
import { day, plural, tint } from "./parts";
import { TaskItem } from "./TaskItem";

const pin = (label: string) => <PinButton pin={viewPin(label)} />;

export function Tickets({ s }: { s: OnboardingSummary }) {
  const first = s.joiners[0];
  return (
    <div className="tickets four">
      <Ticket tone={s.overdue.length ? "problem" : "good"} label="Overdue tasks" art={pin("Overdue tasks")} value={String(s.overdue.length)}
        note={s.overdue.length ? `Oldest was due ${day(s.overdue.map((t) => t.dueOn).sort()[0])}` : "Nothing overdue"} />
      <Ticket tone={s.joiners.length ? "attention" : "info"} label="Joiners starting soon" art={pin("Joiners starting soon")} value={String(s.joiners.length)}
        note={first ? `${first.personName} first, ${day(first.startsOn)}` : "None in the next 30 days"} />
      <Ticket tone={s.leavers.length ? "attention" : "info"} label="Leavers this week" art={pin("Leavers this week")} value={String(s.leavers.length)}
        note={s.leavers.length ? s.leavers.map((c) => c.personName).join(", ") : "No one leaves this week"} />
      <Ticket tone="info" label="Open tasks" art={pin("Open tasks")} value={String(s.open.tasks)} note={`Across ${plural(s.open.checklists, "open checklist")}`} />
    </div>
  );
}

function Person({ c, note }: { c: ChecklistRow; note: string }) {
  return (
    <li className="pinnable">
      <div className="l"><span className={`av sm ${tint(c.personId)}`} aria-hidden="true">{c.initials}</span><div>{c.personName}<small>{note}</small></div></div>
      <PinButton inline pin={checklistPin(c)} />
    </li>
  );
}

/** The attention card: overdue tasks first, then who starts soon and who leaves this week. */
export function Attention({ s }: { s: OnboardingSummary }) {
  return (
    <div className="card pinnable">
      <PinButton pin={viewPin("Needs attention")} />
      <div className="card-head"><h2>Needs attention</h2></div>
      <ul className="list">
        {s.overdue.map((t) => <TaskItem key={t.id} t={t} personName={t.personName} showPerson />)}
        {!s.overdue.length && <li><p className="empty-line">No task is overdue.</p></li>}
      </ul>
      <div className="hr" />
      <h3>Starting soon</h3>
      <ul className="list">
        {s.joiners.map((c) => <Person key={c.id} c={c} note={`Joins ${day(c.startsOn)}, ${c.done} of ${c.tasks.length} done`} />)}
        {!s.joiners.length && <li><p className="empty-line">No one joins in the next 30 days.</p></li>}
      </ul>
      <div className="hr" />
      <h3>Leaving this week</h3>
      <ul className="list">
        {s.leavers.map((c) => <Person key={c.id} c={c} note={`Last day ${day(c.startsOn)}, ${c.done} of ${c.tasks.length} done`} />)}
        {!s.leavers.length && <li><p className="empty-line">No one leaves this week.</p></li>}
      </ul>
    </div>
  );
}
