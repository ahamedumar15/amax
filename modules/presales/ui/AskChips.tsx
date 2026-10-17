import type { OpportunityRow } from "../server/queries";
import type { Stage } from "../contracts";
import { AskButton } from "./AskButton";
import { oppPin, STAGE_UI } from "./parts";

export function AskChips({ o, next }: { o: OpportunityRow; next: Stage }) {
  const pin = oppPin(o);
  const asks: [string, string][] = [
    [`Move to ${STAGE_UI[next].label}`, `Move ${o.number} to ${STAGE_UI[next].label}`],
    ["Mark as lost", `Mark ${o.number} as lost. Reason: `],
    ["Log activity", `Log an activity on ${o.number}: `],
    ["Add task", `Add a task to ${o.number}: `],
    ["Add risk", `Add a risk to ${o.number}: `],
    ["Change details", `Change details on ${o.number}: `],
  ];
  return (
    <div className="asks" role="group" aria-label="Ask amax to">
      <span className="muted">Ask amax to:</span>
      {asks.map(([label, prompt]) => <AskButton key={label} label={label} prompt={prompt} pin={pin} />)}
    </div>
  );
}
