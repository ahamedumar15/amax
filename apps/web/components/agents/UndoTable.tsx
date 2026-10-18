import type { SuggestionView } from "@amax/agents/server";
import { EmptyState, PinButton } from "@amax/ui";
import { AskButton } from "../settings/AskButton";
import { day, forWhom, named, pinOf, prompts } from "./format";

// 006 AC-3: accepted changes still inside their undo window (7 days, or the module's cutoff).
export function UndoTable({ rows }: { rows: SuggestionView[] }) {
  return (
    <div className="card flush pinnable">
      <div className="card-head"><h2>Accepted, can be undone</h2><PinButton inline pin={{ label: "Accepted suggestions that can be undone", tool: "list_agent_suggestions", args: { bucket: "undoable" } }} /></div>
      {rows.length === 0 ? <EmptyState icon="clock" title="Nothing to undo" hint="Accepted changes can be undone here for 7 days, or until the module's cutoff." /> : (
        <div className="scroll-x"><table className="tbl">
          <caption className="sr">Accepted suggestions that can be undone</caption>
          <thead><tr><th>Change</th><th>Decided</th><th>Undo until</th><th className="num"><span className="sr">Undo</span></th></tr></thead>
          <tbody>{rows.map((s) => (
            <tr key={s.id} className="pinnable" data-suggestion={s.id}>
              <td data-label="Change" className="wide"><b>{s.title}</b><small>{s.agent.name} {forWhom(s)}</small></td>
              <td data-label="Decided">{named(s.decidedBy)}<small>{day(s.decidedAt)}</small></td>
              <td data-label="Undo until">{day(s.undoUntil)}</td>
              <td className="num"><span className="ask-row">
                <AskButton label="Ask amax to undo" prompt={prompts.undo(s)} pin={pinOf(s)} tool="undo_agent_suggestion" name={`Ask amax to undo ${s.title}`} />
                <PinButton pin={pinOf(s)} />
              </span></td>
            </tr>))}</tbody>
        </table></div>
      )}
    </div>
  );
}
