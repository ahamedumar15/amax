import { PinButton, Ticket } from "@amax/ui";
import { viewPin } from "../pins";
import { money, thousands } from "../server/fmt";
import type { Financials } from "../server/view";

export function Tiles({ f }: { f: Financials }) {
  const pin = (what: string, art: string) => <><svg className="art" viewBox="0 0 120 110" aria-hidden="true"><use href={`#fin-art-${art}`} /></svg><PinButton pin={viewPin(what)} /></>;
  const n = f.contracts.length;
  return (
    <div className="tickets">
      <Ticket tone="info" label="Contract value" art={pin("Contract value", "coins")} value={money(f.contractValue, f.currency)} note={`${n} active contract${n === 1 ? "" : "s"}`} />
      <Ticket tone="info" label="Invoiced to date" art={pin("Invoiced to date", "chart")} value={money(f.invoiced, f.currency)}
        progress={{ percent: f.invoicedPct, label: `${f.invoicedPct}% of ${thousands(f.contractValue, f.currency)} contract value` }} />
      <Ticket tone={Number(f.overdue) > 0 ? "problem" : "good"} label="Overdue" art={pin("Overdue", "clock")} value={money(f.overdue, f.currency)} note={f.overdueNote} />
    </div>
  );
}
