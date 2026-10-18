import type { PinnedRecord } from "@amax/core";
import type { PinRef } from "@amax/ui";

// Payroll pins name a record by its id (059); the label comes from the record as it is now. Every pin
// resolves through a read tool that applies the viewer's pay level, so a pin never shows more pay
// than the screen it came from.
type RunLike = { id: string; entityName: string; periodLabel: string };
export const runLabel = (r: RunLike) => `${r.entityName} payroll, ${r.periodLabel}`;
export const runPin = (r: RunLike): PinRef => ({ label: runLabel(r), tool: "get_payroll_run", args: { runId: r.id } });
export const changePin = (c: { id: string; personName: string; periodLabel: string }): PinRef => ({ label: `${c.personName}, change in ${c.periodLabel} pay`, tool: "get_pay_change", args: { changeId: c.id } });
export const payslipPin = (s: { id: string; personName: string; periodLabel: string }): PinRef => ({ label: `${s.personName}, ${s.periodLabel} payslip`, tool: "get_payslip", args: { payslipId: s.id } });
export const viewPin = (label: string, tool = "list_payroll_runs"): PinRef => ({ label, tool, args: {} });

export const runOf = (r: RunLike | null): PinnedRecord | null => (r ? { id: r.id, label: runLabel(r) } : null);
export const changeOf = (c: { id: string; personName: string; periodLabel: string } | null): PinnedRecord | null => (c ? { id: c.id, label: changePin(c).label } : null);
export const payslipOf = (s: { id: string; personName: string; periodLabel: string } | null): PinnedRecord | null => (s ? { id: s.id, label: payslipPin(s).label } : null);
/** A metric or step of one run (a total, a cost centre, a step): it resolves to the run that holds it. */
export const metricPin = (r: RunLike, what: string): PinRef => ({ label: `${what}, ${runLabel(r)}`, tool: "get_payroll_run", args: { runId: r.id } });
