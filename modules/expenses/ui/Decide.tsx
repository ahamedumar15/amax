import { PinButton } from "@amax/ui";
import { claimPin, viewPin } from "../pins";
import type { ClaimView } from "../server/rows";
import { AskButton } from "./AskButton";
import { ClaimCells } from "./parts";

function Decision({ c }: { c: ClaimView }) {
  const pin = claimPin(c);
  const as = c.step === "manager" ? "as their manager" : "as Finance";
  return (
    <span className="decide">
      <AskButton className="btn sm primary" label="Approve" pin={pin} prompt={`Approve ${c.number}, ${c.personName}'s ${c.categoryName.toLowerCase()} claim for ${c.amountText}, ${as}`} name={`Ask amax to approve ${c.number} for ${c.personName}`} />
      <AskButton label="Reject" pin={pin} prompt={`Reject ${c.number}, ${c.personName}'s ${c.categoryName.toLowerCase()} claim, because `} name={`Ask amax to reject ${c.number} for ${c.personName}`} />
    </span>
  );
}

export function Decide({ rows }: { rows: ClaimView[] }) {
  return (
    <div className="card flush pinnable">
      <div className="card-head"><h2>Needs your decision</h2><span className="chip agent">Manager first, then Finance</span><PinButton pin={viewPin("Expense claims needing a decision")} /></div>
      {rows.length ? (
        <div className="scroll-x"><table className="tbl">
          <thead><tr><th>Person</th><th>Expense</th><th>Spent</th><th className="num">Amount</th><th>Step</th><th className="num">Decision</th><th className="num"><span className="sr">Pin</span></th></tr></thead>
          <tbody>{rows.map((c) => (
            <tr key={c.id} className="pinnable" data-claim={c.number}>
              <ClaimCells c={c} />
              <td data-label="Step"><span className={`chip ${c.overLimit ? "warn" : "info"}`}>{c.step === "manager" ? "You, as manager" : "You, as Finance"}</span></td>
              <td data-label="Decision" className="num"><Decision c={c} /></td>
              <td className="num"><PinButton inline pin={claimPin(c)} /></td>
            </tr>))}
          </tbody></table></div>
      ) : <p className="empty-line pad">Nothing waits for your decision.</p>}
    </div>
  );
}
