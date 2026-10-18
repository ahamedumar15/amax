import { PinButton } from "@amax/ui";
import { changePin, metricPin } from "../pins";
import type { RunView } from "../server/queries";
import { AskButton } from "./AskButton";
import { Pay, signed, tint } from "./parts";

type Change = NonNullable<RunView["changes"]>[number];

const amount = (c: Change) => (c.kind === "joiner" ? "First salary" : <Pay v={c.amount}>{signed}</Pay>);
const agent = (c: Change) => (c.needsCheck ? <span className="chip warn">Check before deducting</span> : <span className="chip agent">Explained</span>);
const DONE: Partial<Record<Change["status"], string>> = { queried: "Queried", dismissed: "Dismissed", expired: "Expired, ask for a fresh one", explaining: "Agent is explaining" };

function Decision({ c, run }: { c: Change; run: RunView }) {
  if (c.status === "accepted") return <span className="chip good">Accepted{c.decidedBy ? ` by ${c.decidedBy}` : ""}</span>;
  const pin = changePin({ id: c.id, personName: c.personName, periodLabel: run.periodLabel });
  const open = c.status === "open" || c.status === "queried";
  return (
    <span className="decide">
      {c.status !== "open" && <span className="chip warn">{DONE[c.status]}</span>}
      {open && <AskButton className="btn sm primary" label="Accept" prompt={`Accept the payroll agent's change to ${c.personName}'s ${run.periodLabel} pay`} pin={pin} name={`Ask amax to accept the change for ${c.personName}`} />}
      {c.status === "open" && <AskButton label="Query" prompt={`Query the payroll agent's change to ${c.personName}'s ${run.periodLabel} pay: `} pin={pin} name={`Ask amax to query the change for ${c.personName}`} />}
    </span>
  );
}

// 014 AC-2: every change since last period with the agent's explanation; a person accepts or queries it through chat.
export function Changes({ run }: { run: RunView }) {
  const rows = run.changes ?? [];
  return (
    <div className="card flush pinnable">
      <div className="card-head"><h2>Changes since {run.previousLabel.split(" ")[0]}</h2><span className="chip agent">The agent explains, a person decides</span><PinButton pin={metricPin(run, "Changes since last period")} /></div>
      {rows.length ? (
        <div className="scroll-x"><table className="tbl">
          <thead><tr><th>Person</th><th className="num">Change</th><th>Explanation</th><th>Agent</th><th className="num">Decision</th><th className="num"><span className="sr">Pin</span></th></tr></thead>
          <tbody>{rows.map((c) => (
            <tr key={c.id} className="pinnable" data-change-row={c.status === "accepted" ? "resolved" : "open"}>
              <td data-label="Person"><div className="who"><span className={`av sm ${tint(c.personId)}`} aria-hidden="true">{c.initials}</span>{c.personName}</div></td>
              <td data-label="Change" className="num">{amount(c)}</td>
              <td data-label="Explanation" className="why">{c.explanation}</td>
              <td data-label="Agent">{agent(c)}</td>
              <td data-label="Decision" className="num"><Decision c={c} run={run} /></td>
              <td className="num"><PinButton inline pin={changePin({ id: c.id, personName: c.personName, periodLabel: run.periodLabel })} /></td>
            </tr>))}
          </tbody></table></div>
      ) : <p className="empty-line pad">No changes since last period.</p>}
    </div>
  );
}
