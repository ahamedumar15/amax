import { PinButton } from "@amax/ui";
import { contractPin, viewPin } from "../pins";
import { money } from "../server/fmt";
import type { Financials } from "../server/view";
import { AskButton } from "./AskButton";
import { ContractActions } from "./ContractActions";

type Row = Financials["contracts"][number];
const DOTS = ["var(--violet)", "var(--amber)", "var(--pink)", "var(--mint)", "var(--sky)"];

function Next({ c }: { c: Row }) {
  const pin = contractPin(c, "Next invoice");
  const ready = c.kind === "retainer" && / ready$/.test(c.next);
  return (
    <div className="next">
      <span>{c.next}</span>
      {c.suggestionId && <span className="decide">
        <AskButton className="btn sm primary" label="Accept draft" pin={pin} prompt={`Accept the billing agent's draft invoice for ${c.projectName}, ${money(c.draft!.amount, c.currency)}`} name={`Ask amax to accept the draft invoice for ${c.projectName}`} />
        <AskButton label="Query" pin={pin} prompt={`Query the billing agent's draft invoice for ${c.projectName}: `} name={`Ask amax to query the draft invoice for ${c.projectName}`} />
      </span>}
      {ready && <AskButton label="Invoice" pin={pin} prompt={`Invoice the ${c.next.split(" ")[0]} retainer for ${c.projectName}`} name={`Ask amax to invoice the retainer for ${c.projectName}`} />}
    </div>
  );
}

export function Contracts({ f, rows }: { f: Financials; rows: Row[] }) {
  return (
    <div className="card flush pinnable">
      <div className="card-head"><h2>Contracts</h2><ContractActions f={f} /><PinButton pin={viewPin("Contracts")} /></div>
      <div className="scroll-x"><table className="tbl">
        <thead><tr><th>Project</th><th>Contract</th><th className="num">Value</th><th>Invoiced</th><th>Next invoice</th><th>Payments</th><th className="num"><span className="sr">Pin</span></th></tr></thead>
        <tbody>{rows.map((c, i) => (
          <tr key={c.id} className="pinnable" data-contract={c.projectKey}>
            <td data-label="Project"><span className="dot" style={{ background: DOTS[i % DOTS.length] }} aria-hidden="true" />{c.projectName}</td>
            <td data-label="Contract">{c.kindLabel}<small>{c.terms}</small></td>
            <td data-label="Value" className="num">{money(c.value, c.currency)}</td>
            <td data-label="Invoiced"><div className="row"><div className="meter" role="img" aria-label={`${c.invoicedPct}% invoiced`}><i style={{ width: `${Math.min(100, c.invoicedPct)}%`, background: DOTS[i % DOTS.length] }} /></div>{c.invoicedPct}%</div></td>
            <td data-label="Next invoice"><Next c={c} /></td>
            <td data-label="Payments"><span className={`chip ${c.payments.tone}`}>{c.payments.text}</span></td>
            <td className="num"><PinButton inline pin={contractPin(c)} /></td>
          </tr>))}
        </tbody></table></div>
      {!rows.length && <p className="empty-line pad">No contracts of this kind.</p>}
    </div>
  );
}
