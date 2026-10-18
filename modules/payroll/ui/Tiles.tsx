import { PinButton, Ticket } from "@amax/ui";
import { metricPin } from "../pins";
import type { RunView } from "../server/queries";
import { big, day, plural } from "./parts";

const pct = (now: string, was: string | null) => {
  if (!was || !Number(was)) return null;
  const p = ((Number(now) - Number(was)) / Number(was)) * 100;
  return `${p >= 0 ? "up" : "down"} ${Math.abs(p).toFixed(1)}%`;
};

/** Gross, net to banks and what's owed (pay and totals readers); the run's size and open changes for HR. */
export function Tiles({ run }: { run: RunView }) {
  const pin = (what: string) => <PinButton pin={metricPin(run, what)} />;
  const m = run.money;
  if (!m) {
    return (
      <div className="tickets">
        <Ticket tone="info" label="Payslips" art={pin("Payslips")} value={String(run.headcount)} note={`${run.entityName}, ${run.periodLabel}`} />
        <Ticket tone={run.open ? "attention" : "good"} label="Open changes" art={pin("Open changes")} value={String(run.open)} note={run.open ? "Accept or query each before approval" : "Every change is accepted"} />
        <Ticket tone="info" label="Step" art={pin("Step")} value={run.steps.find((s) => s.state === "now")?.label ?? "Payslips sent"} note="Amounts are for Payroll and Finance" />
      </div>
    );
  }
  const owed = (run.statutory ?? []).reduce((n, s) => n + Number(s.amount), 0).toFixed(2);
  const trend = pct(m.totals.gross, m.previousGross);
  const deductions = m.breakdown.slice(1).map((b) => `${b.label} ${big("", b.amount).trim()}`).join(" − ");
  return (
    <div className="tickets">
      <Ticket tone="info" label="Gross pay" art={pin("Gross pay")} value={big(run.currency, m.totals.gross)} note={`${plural(m.totals.people, "person", "people")}${trend ? `, ${trend} on ${run.previousLabel.split(" ")[0]}` : ""}`} />
      <Ticket tone="info" label="Net to banks" art={pin("Net to banks")} value={big(run.currency, m.totals.net)} note={deductions ? `Gross − ${deductions}` : "No deductions"} />
      <Ticket tone="attention" label="Statutory" art={pin("Statutory")} value={big(run.currency, owed)}
        note={(run.statutory ?? []).map((s) => `${s.label} due ${day(s.dueOn)}`).join("; ") || "Nothing owed"} />
    </div>
  );
}
