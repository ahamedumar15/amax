import { AskButton } from "./AskButton";
import { monthLabel } from "../server/months";

export function CopyMonth({ months, team, everyone }: { months: string[]; team: string; everyone: boolean }) {
  return (
    <AskButton className="btn primary" label="Ask amax to copy a month" pin={{ label: "People by month", tool: "list_allocations", args: { everyone } }}
      prompt={`Copy ${team} allocations from ${monthLabel(months[0], "long")} (${months[0].slice(0, 7)}) to the next month`} />
  );
}
