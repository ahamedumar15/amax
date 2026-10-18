import { PinButton } from "@amax/ui";
import { viewPin } from "../pins";
import { compact, money } from "../server/fmt";
import { monthLabel } from "../server/read";
import type { Financials } from "../server/view";
import { Bars, Donut } from "./charts";

const AGE = ["#2FCB8C", "#5CC8F0", "#F2A93B", "#F26B5B"];
const k = (v: string) => Math.round(Number(v) / 1000);

export function Cards({ f }: { f: Financials }) {
  const open = Number(f.ageing.open) || 1;
  return (
    <div className="cols even">
      <div className="card pinnable">
        <PinButton pin={viewPin("Invoiced per month")} />
        <div className="card-head"><h2>Invoiced per month</h2><span className="muted">{f.currency}, against target. {monthLabel(f.asOf).split(" ")[0]} to date</span></div>
        <Bars label={`Invoiced per month in thousands of ${f.currency}, target ${k(f.target)}`} labels={f.monthly.map((m) => m.label)} values={f.monthly.map((m) => k(m.amount))}
          max={Math.max(100, ...f.monthly.map((m) => Math.ceil(k(m.amount) / 20) * 20))} target={k(f.target)} unit="k" partial />
      </div>
      <div className="card pinnable">
        <PinButton pin={viewPin("Receivables by age")} />
        <div className="card-head"><h2>Receivables by age</h2><span className="muted">{money(f.ageing.open, f.currency)} open</span></div>
        <Donut label="Receivables by age" center={compact(f.ageing.open, f.currency)} sub="to collect"
          parts={f.ageing.buckets.map((b, i) => ({ name: b.label, value: Number(b.amount), color: AGE[i], shown: `${Math.round((Number(b.amount) / open) * 100)}%` }))} />
        <p className="src">Age past the due date, at stored rates. Invoiced in base currency: {f.byEntity.map((e) => `${e.entityName} ${money(e.invoiced, e.baseCurrency)}`).join("; ") || "none yet"}.</p>
      </div>
    </div>
  );
}
