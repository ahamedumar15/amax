import type { Viewer } from "@amax/auth";
import { listSuggestions } from "@amax/agents/server";
import { PinButton } from "@amax/ui";
import { AskButton } from "./AskButton";

// 006 AC-2: the allocation changes agents suggest, where they apply. Deciding happens in chat; the
// full evidence, undo window and runs are on the Suggestions screen.
export async function AllocationSuggestions({ viewer }: { viewer: Viewer }) {
  const rows = await listSuggestions(viewer, { bucket: "open", kind: "allocations.rebalance" });
  if (!rows.length) return null;
  return (
    <div className="card flush pinnable" style={{ marginBottom: 28 }}>
      <div className="card-head"><h2>Agent suggestions</h2><PinButton inline pin={{ label: "Allocation suggestions", tool: "list_agent_suggestions", args: { bucket: "open", kind: "allocations.rebalance" } }} /><span className="chip agent">An agent suggests, a person decides</span><a className="btn sm" href="/suggestions">All suggestions</a></div>
      <div className="scroll-x"><table className="tbl">
        <caption className="sr">Allocation changes agents suggest</caption>
        <thead><tr><th>Suggestion</th><th>Agent</th><th className="num"><span className="sr">Decide</span></th></tr></thead>
        <tbody>{rows.map((s) => (
          <tr key={s.id} className="pinnable">
            <td style={{ whiteSpace: "normal" }}><b>{s.title}</b>{s.detail && <small style={{ display: "block" }}>{s.detail}</small>}</td>
            <td><span className="chip agent">{s.agent.name}</span>{s.source.external && <span className="chip warn">External source: {s.source.label}</span>}</td>
            <td className="num"><AskButton label="Ask amax to accept" prompt={`Accept the suggestion "${s.title}" (suggestion id ${s.id})`} pin={{ label: s.title, tool: "get_agent_suggestion", args: { id: s.id } }} name={`Ask amax to accept ${s.title}`} />{" "}
              <PinButton pin={{ label: s.title, tool: "get_agent_suggestion", args: { id: s.id } }} /></td>
          </tr>))}</tbody>
      </table></div>
    </div>
  );
}
