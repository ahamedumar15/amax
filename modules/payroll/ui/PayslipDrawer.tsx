import { PinButton } from "@amax/ui";
import { payslipPin } from "../pins";
import type { PayslipView } from "../server/queries";
import { money } from "./parts";

const Line = ({ label, amount, minus }: { label: string; amount: string; minus?: boolean }) => (
  <div className="row"><span>{label}</span><span className="pay">{minus ? "− " : ""}{money(amount, true)}</span></div>
);

// The payslip drawer, opened by its link (`slip=`) and closed by going back to the run: no client state.
export function PayslipDrawer({ s, close }: { s: PayslipView; close: string }) {
  const of = (k: string) => s.lines.filter((l) => l.kind === k);
  const notes = s.lines.filter((l) => l.basis).map((l) => `${l.label}: ${l.basis}`);
  return (
    <dialog open className="drawer pinnable" aria-labelledby="slip-title">
      <div className="drawer-head">
        <div><h2 id="slip-title">{s.personName}</h2><span className="muted">Payslip, {s.periodLabel}</span></div>
        <a className="iconbtn" href={close} aria-label="Close payslip"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg></a>
      </div>
      <PinButton pin={payslipPin(s)} />
      <div className="payslip">
        <h3>Earnings</h3>
        {of("earning").map((l, i) => <Line key={i} label={l.label} amount={l.amount} />)}
        <Line label="Gross" amount={s.gross} />
        <h3>Deductions</h3>
        {of("deduction").map((l, i) => <Line key={i} label={l.label} amount={l.amount} minus />)}
        <div className="row tot"><span>Net pay</span><span className="pay">{s.currency} {money(s.net, true)}</span></div>
        <p className="muted small">Employer also pays {of("employer").map((l) => `${l.label} (${money(l.amount, true)})`).join(" and ") || "nothing further"}. {s.daysPaid < s.workingDays ? `Paid for ${s.daysPaid} of ${s.workingDays} working days.` : ""}</p>
        {notes.length > 0 && <ul className="muted small notes">{notes.map((n) => <li key={n}>{n}</li>)}</ul>}
        {s.pack && <p className="muted small">Calculated by the {s.pack}.</p>}
      </div>
    </dialog>
  );
}
