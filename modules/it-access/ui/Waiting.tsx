import { PinButton } from "@amax/ui";
import { changeLabel, changePin, viewPin } from "../pins";
import type { AccessView } from "../server/view";
import { AskButton } from "./AskButton";
import { dayMonth, plural } from "./parts";

// Approved changes the write registration couldn't make: nothing has changed until someone in IT
// does it by hand and confirms it here (through chat). Leaver revokes come first.
export function Waiting({ v }: { v: AccessView }) {
  if (!v.waiting.length) return null;
  return (
    <div className="card pinnable waiting">
      <PinButton pin={viewPin("Waiting for IT")} />
      <div className="card-head"><h2>Waiting for IT</h2><span className="chip warn">{plural(v.waiting.length, "change")} to make by hand</span></div>
      <ul className="list">{v.waiting.map((w) => {
        const label = changeLabel(w);
        return (
          <li key={w.changeId} className="pinnable" data-change={w.changeId}>
            <div className="l"><div>{label}
              <small>{w.leaver ? `Their last day was ${dayMonth(w.effectiveOn)}; their access is still live` : `Due ${dayMonth(w.effectiveOn)}`}. {w.outcome}</small></div></div>
            <AskButton label="Confirm done" pin={changePin(w)} name={`Confirm with amax that you made: ${label}`}
              prompt={`Confirm I made this change by hand: ${label} (change id ${w.changeId})`} />
            <PinButton pin={changePin(w)} />
          </li>);
      })}</ul>
    </div>
  );
}
