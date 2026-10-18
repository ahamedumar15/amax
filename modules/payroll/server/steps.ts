import { can, type Viewer } from "@amax/auth";
import { STEP_LABELS, STEPS, type RunStatus } from "../contracts";
import { iso, who } from "./read";

export type StepView = { key: RunStatus; label: string; state: "done" | "now" | "todo"; at: string | null; by: string | null };
export type NextStep = { step: RunStatus; label: string; prompt: string; enabled: boolean; hint: string | null } | null;

const COLS: Record<RunStatus, [string, string, string]> = {
  draft: ["drafted_at", "drafted_by", "drafted_name"], checked: ["checked_at", "checked_by", "checked_name"], hr_approved: ["hr_approved_at", "hr_approved_by", "hr_name"],
  finance_approved: ["finance_approved_at", "finance_approved_by", "finance_name"], bank_file: ["bank_file_at", "bank_file_by", "bank_name"], payslips_sent: ["sent_at", "sent_by", "sent_name"],
};

/** The run's six steps: done ones with who and when, the next one "now". */
export function stepsOf(r: Record<string, unknown>): StepView[] {
  const done = STEPS.indexOf(r.status as RunStatus);
  return STEPS.map((k, i) => {
    const [at, by, name] = COLS[k];
    return { key: k, label: STEP_LABELS[k], state: i <= done ? "done" : i === done + 1 ? "now" : "todo", at: i <= done ? iso(r[at]) : null, by: i <= done ? who(r[by], r[name]) : null };
  });
}

const NEXT: Partial<Record<RunStatus, { step: RunStatus; label: string; permission: string; prompt: (when: string) => string; who: string }>> = {
  draft: { step: "checked", label: "Run the agent check", permission: "payroll:run:check", prompt: (w) => `Run the agent variance check on ${w}`, who: "Payroll runs the agent check" },
  checked: { step: "hr_approved", label: "Approve run", permission: "payroll:run:approve-hr", prompt: (w) => `Approve ${w} for HR`, who: "HR approves this step" },
  hr_approved: { step: "finance_approved", label: "Approve totals", permission: "payroll:run:approve-finance", prompt: (w) => `Approve the totals of ${w} for Finance`, who: "Finance approves the totals" },
  finance_approved: { step: "bank_file", label: "Approve bank file", permission: "payroll:bank-file:approve", prompt: (w) => `Approve the bank file for ${w}`, who: "Payroll approves the bank file" },
  bank_file: { step: "payslips_sent", label: "Send payslips", permission: "payroll:payslips:send", prompt: (w) => `Send the payslips for ${w}`, who: "Payroll sends payslips" },
};

/** 014 AC-2: the next step for this viewer. "Approve run" stays disabled while any change is open or queried. */
export function nextOf(v: Viewer, r: { status: RunStatus; legalEntityId: string }, open: number, when: string): NextStep {
  const n = NEXT[r.status];
  if (!n) return null;
  const allowed = can(v, n.permission, { legalEntityId: r.legalEntityId });
  const blocked = r.status === "checked" && open > 0;
  const hint = blocked ? `Resolve the ${open} open change${open === 1 ? "" : "s"} to approve the run`
    : r.status === "finance_approved" ? "Two people approve the bank file; it can't be undone" : allowed ? null : n.who;
  return { step: n.step, label: n.label, prompt: n.prompt(when), enabled: allowed && !blocked, hint };
}
