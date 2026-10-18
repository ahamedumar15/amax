import { PinButton } from "@amax/ui";
import { metricPin, payslipPin } from "../pins";
import type { RunView } from "../server/queries";
import { NextStep } from "./NextStep";
import { money, tint } from "./parts";

const FLAG: Record<string, string> = { overtime: "Overtime", "pro-rata": "Pro rata", "no-base-salary": "No base salary in HR" };

function Check({ s }: { s: NonNullable<RunView["payslips"]>[number] }) {
  if (s.change && s.change !== "accepted") return <span className="chip warn">Change open</span>;
  const f = s.flags.map((x) => FLAG[x] ?? x);
  return f.length ? <span className="chip agent">{f.join(", ")}</span> : <span className="muted">None</span>;
}

/** Payroll and Admin: every payslip, and the run's next step ("Approve run" stays disabled while a change is open). */
export function Payslips({ run }: { run: RunView }) {
  return (
    <div className="card flush pinnable">
      <div className="card-head"><h2>Payslips</h2><div className="actions"><NextStep run={run} /></div><PinButton pin={metricPin(run, "Payslips")} /></div>
      <div className="scroll-x"><table className="tbl">
        <thead><tr><th>Person</th><th>Cost centre</th><th className="num">Gross</th><th className="num">Deductions</th><th className="num">Net</th><th>Check</th><th className="num"><span className="sr">Actions</span></th></tr></thead>
        <tbody>{run.payslips!.map((s) => (
          <tr key={s.id} className="pinnable">
            <td data-label="Person"><div className="who"><span className={`av sm ${tint(s.personId)}`} aria-hidden="true">{s.initials}</span>{s.personName}</div></td>
            <td data-label="Cost centre">{s.costCentre}</td>
            <td data-label="Gross" className="num pay">{money(s.gross)}</td><td data-label="Deductions" className="num pay">{money(s.deductions)}</td><td data-label="Net" className="num"><b className="pay">{money(s.net)}</b></td>
            <td data-label="Check"><Check s={s} /></td>
            <td className="num"><span className="row-actions"><a className="btn sm" href={`/payroll?run=${run.id}&slip=${s.id}`} aria-label={`View payslip, ${s.personName}`}>View payslip</a>
              <PinButton inline pin={payslipPin({ id: s.id, personName: s.personName, periodLabel: run.periodLabel })} /></span></td>
          </tr>))}
        </tbody></table></div>
    </div>
  );
}
