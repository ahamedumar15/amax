import { PinButton } from "@amax/ui";
import { taskPin } from "../pins";
import type { TaskRow } from "../server/queries";
import { AskButton } from "./AskButton";
import { day } from "./parts";

const status = (t: TaskRow) => (t.doneOn ? `Done ${day(t.doneOn)}` : t.overdue ? `Overdue, was due ${day(t.dueOn)}` : `Due ${day(t.dueOn)}`);

// 013 AC-1: completing a task is a chat write (complete_checklist_task) after the confirm; here it's "Ask amax".
export function TaskItem({ t, personName, showPerson = false }: { t: TaskRow; personName: string; showPerson?: boolean }) {
  const pin = taskPin({ id: t.id, title: t.title, personName });
  return (
    <li className={`pinnable${t.doneOn ? " done" : ""}`}>
      <div className="l">
        <span className={`tick${t.doneOn ? " on" : ""}`} aria-hidden="true">{t.doneOn ? "✓" : ""}</span>
        <div>{t.title}{t.access && <span className="chip agent">{t.access === "grant" ? "Access to grant" : "Access to revoke"}</span>}
          <small>{showPerson ? `${personName}, ` : ""}{t.ownerLabel}, <span className={t.overdue ? "late" : undefined}>{status(t)}</span></small></div>
      </div>
      <div className="r">
        {t.canComplete && <AskButton label="✦ Ask amax" prompt={`Mark "${t.title}" done for ${personName}`} pin={pin} name={`Ask amax to mark ${t.title} done for ${personName}`} />}
        <PinButton inline pin={pin} />
      </div>
    </li>
  );
}
