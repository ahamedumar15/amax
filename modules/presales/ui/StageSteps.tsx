import { PinButton } from "@amax/ui";
import type { Stage } from "../contracts";
import type { OpportunityRow, StageChangeRow } from "../server/queries";
import { day, oppPin, STAGE_UI } from "./parts";

const PATH: Stage[] = ["new-idea", "lead", "qualified", "proposal", "negotiation", "won"];

// The stage path; a stage counts as done once the opportunity has been past it.
export function StageSteps({ o, history }: { o: OpportunityRow; history: StageChangeRow[] }) {
  const stage = o.stage;
  const path = stage === "lost" ? [...PATH.slice(0, 5), "lost" as Stage] : PATH;
  const reached = (s: Stage) => [...history].reverse().find((h) => h.to === s);
  const at = path.indexOf(stage);
  const furthest = Math.max(at, ...history.map((h) => path.indexOf(h.to)));
  return (
    <div className="card steps-card">
      <ol className="steps" aria-label="Stages">
        {path.map((s, i) => {
          const hit = reached(s);
          const cls = s === stage ? (s === "won" || s === "lost" ? "done" : "now") : i < furthest ? "done" : "";
          return (
            <li key={s} className={`${cls} pinnable`.trim()} aria-current={s === stage ? "step" : undefined}>{STAGE_UI[s].label}{hit && <small>{s === stage && cls === "now" ? `since ${day(hit.at)}` : day(hit.at)}</small>}
              <PinButton pin={{ ...oppPin(o), label: `${o.number} ${STAGE_UI[s].label} stage` }} /></li>
          );
        })}
      </ol>
    </div>
  );
}
