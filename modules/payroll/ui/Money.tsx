import { PinButton } from "@amax/ui";
import { metricPin } from "../pins";
import type { RunView } from "../server/queries";
import { CostLine, Donut } from "./charts";
import { money } from "./parts";

const M = (v: string) => Number(v) / 1e6;

/** Where the money goes and the payroll cost line (pay and totals readers). */
export function MoneyCards({ run }: { run: RunView }) {
  const m = run.money!;
  const unit = Number(m.totals.gross) >= 1e6;
  const fig = (v: string) => (unit ? `${M(v).toFixed(2)}M` : money(v));
  return (
    <div className="cols even">
      <div className="card pinnable">
        <PinButton pin={metricPin(run, "Where the money goes")} />
        <div className="card-head"><h2>Where the money goes</h2><span className="muted">{run.currency}{unit ? " millions" : ""}, {run.periodLabel.split(" ")[0]}</span></div>
        <Donut label="Where the money goes" center={fig(m.totals.gross)} sub="gross pay" parts={m.breakdown.map((b) => ({ name: b.label, value: Number(b.amount), shown: fig(b.amount) }))} />
      </div>
      <div className="card pinnable">
        <PinButton pin={metricPin(run, "Payroll cost")} />
        <div className="card-head"><h2>Payroll cost</h2>{m.previousGross && <span className="muted">{Number(m.totals.gross) >= Number(m.previousGross) ? "↑" : "↓"} {Math.abs(((Number(m.totals.gross) - Number(m.previousGross)) / Number(m.previousGross)) * 100).toFixed(1)}% on {run.previousLabel.slice(0, 3)}</span>}</div>
        <CostLine label={`Gross payroll per month, ${run.currency}${unit ? " millions" : ""}`} labels={m.trend.map((t) => t.label)} data={m.trend.map((t) => (unit ? M(t.gross) : Number(t.gross)))} unit={unit ? `${run.currency} millions` : run.currency} />
        <p className="src">The axis starts near the lowest month so the change is visible.</p>
      </div>
    </div>
  );
}

/** 014 AC-1: Finance approves totals by entity and cost centre; small cost centres are folded so no total is one person's pay. */
export function CostCentres({ run }: { run: RunView }) {
  const m = run.money!;
  return (
    <div className="card flush pinnable">
      <div className="card-head"><h2>Totals by cost centre</h2><span className="muted">{run.entityName}</span><PinButton pin={metricPin(run, "Totals by cost centre")} /></div>
      <div className="scroll-x"><table className="tbl">
        <thead><tr><th>Cost centre</th><th className="num">People</th><th className="num">Gross</th><th className="num">Deductions</th><th className="num">Net</th><th className="num">Employer</th><th className="num"><span className="sr">Pin</span></th></tr></thead>
        <tbody>
          {m.costCentres.map((c) => (
            <tr key={c.name} className="pinnable"><td data-label="Cost centre">{c.name}</td><td data-label="People" className="num">{c.people}</td><td data-label="Gross" className="num pay">{money(c.gross)}</td>
              <td data-label="Deductions" className="num pay">{money(c.deductions)}</td><td data-label="Net" className="num"><b className="pay">{money(c.net)}</b></td><td data-label="Employer" className="num pay">{money(c.employer)}</td>
              <td className="num"><PinButton inline pin={metricPin(run, `${c.name} cost centre`)} /></td></tr>))}
          <tr className="pinnable total"><td data-label="Cost centre"><b>{run.entityName}</b></td><td data-label="People" className="num">{m.totals.people}</td><td data-label="Gross" className="num pay">{money(m.totals.gross)}</td>
            <td data-label="Deductions" className="num pay">{money(m.totals.deductions)}</td><td data-label="Net" className="num"><b className="pay">{money(m.totals.net)}</b></td><td data-label="Employer" className="num pay">{money(m.totals.employer)}</td>
            <td className="num"><PinButton inline pin={metricPin(run, "Entity total")} /></td></tr>
        </tbody></table></div>
    </div>
  );
}
