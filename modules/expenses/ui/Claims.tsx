import { IntentButton, PinButton } from "@amax/ui";
import { claimPin, viewPin } from "../pins";
import type { ClaimView } from "../server/rows";
import { Amount, What, Who } from "./parts";

export function Claims({ rows }: { rows: ClaimView[] }) {
  return (
    <div className="card flush pinnable">
      <div className="card-head"><h2>Claims</h2><span className="actions"><IntentButton intent="expenses.claim" label="Claim an expense" primary={false} /></span><PinButton pin={viewPin("Expense claims")} /></div>
      {rows.length ? (
        <div className="scroll-x"><table className="tbl">
          <thead><tr><th>Number</th><th>Person</th><th>Expense</th><th>Spent</th><th className="num">Amount</th><th>Status</th><th>Payment</th><th className="num"><span className="sr">Pin</span></th></tr></thead>
          <tbody>{rows.map((c) => (
            <tr key={c.id} className="pinnable" data-claim={c.number}>
              <td data-label="Number">{c.number}</td>
              <td data-label="Person"><Who c={c} /></td>
              <td data-label="Expense"><What c={c} /></td>
              <td data-label="Spent">{c.spentText}</td>
              <td data-label="Amount" className="num"><Amount c={c} /></td>
              <td data-label="Status"><span className={`chip ${c.tone}`}>{c.statusLabel}</span></td>
              <td data-label="Payment">{c.payText}</td>
              <td className="num"><PinButton inline pin={claimPin(c)} /></td>
            </tr>))}
          </tbody></table></div>
      ) : <p className="empty-line pad">No claims you can see yet. Claim an expense through amax.</p>}
    </div>
  );
}
