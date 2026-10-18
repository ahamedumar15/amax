import type { SuggestionView } from "@amax/agents/server";
import { EmptyState, PinButton } from "@amax/ui";
import { AskButton } from "../settings/AskButton";
import { day, flags, forWhom, pinOf, prompts } from "./format";

function Evidence({ s }: { s: SuggestionView }) {
  return (<>
    {s.evidence.map((e, i) => <span key={i}>{i > 0 && " · "}{e.ref.startsWith("/") ? <a href={e.ref}>{e.label}</a> : e.label}</span>)}
    {s.source.external && <><span className="chip warn">External source: {s.source.channel}</span><small>{s.source.label}</small></>}
  </>);
}

// 006 AC-2: what waits for this person, inside their data scope. Every decision is an Ask amax that
// chat confirms; only Accept changes anything.
export function DecideTable({ rows }: { rows: SuggestionView[] }) {
  return (
    <div className="card flush pinnable">
      <div className="card-head"><h2>Needs your decision</h2><PinButton inline pin={{ label: "Suggestions that need a decision", tool: "list_agent_suggestions", args: { bucket: "open" } }} /><span className="chip agent">An agent suggests, a person decides</span></div>
      {rows.length === 0 ? <EmptyState icon="spark" title="Nothing to decide" hint="Suggestions appear here when an agent proposes a change you may decide." /> : (
        <div className="scroll-x"><table className="tbl">
          <caption className="sr">Suggestions that need your decision</caption>
          <thead><tr><th>Suggestion</th><th>Agent</th><th>Evidence</th><th className="num">Confidence</th><th>Expires</th><th className="num"><span className="sr">Decide</span></th></tr></thead>
          <tbody>{rows.map((s) => (
            <tr key={s.id} className="pinnable" data-suggestion={s.id}>
              <td data-label="Suggestion" className="wide"><b>{s.title}</b><small>{flags(s)}</small></td>
              <td data-label="Agent"><span className="chip agent">{s.agent.name}</span><small>{forWhom(s)}</small></td>
              <td data-label="Evidence" className="evidence"><Evidence s={s} /></td>
              <td data-label="Confidence" className="num">{s.confidence.toFixed(2)}</td>
              <td data-label="Expires">{day(s.expiresAt)}</td>
              <td className="num"><span className="ask-row">
                <AskButton primary small label={s.status === "approved" ? "Approve as second approver" : "Accept"} prompt={prompts.accept(s)} pin={pinOf(s)} tool="accept_agent_suggestion" name={`Ask amax to accept ${s.title}`} />
                {s.status !== "approved" && <AskButton label="Query" prompt={prompts.query(s)} pin={pinOf(s)} tool="query_agent_suggestion" name={`Query ${s.title}`} />}
                <AskButton label="Dismiss" prompt={prompts.dismiss(s)} pin={pinOf(s)} tool="dismiss_agent_suggestion" name={`Dismiss ${s.title}`} />
                <PinButton pin={pinOf(s)} />
              </span></td>
            </tr>))}</tbody>
        </table></div>
      )}
      <p className="src note">Pay, bank files, access and credentials need someone other than the person the agent acted for. Suggestions outside your data scope are never shown.</p>
    </div>
  );
}
