import { sql } from "drizzle-orm";
import type { Tx } from "@amax/db";
import { can, mask, type Masked, type Viewer } from "@amax/auth";
import { ForbiddenError } from "@amax/core/server";
import { moneyOf } from "@amax/core";
import { STEP_LABELS, STEPS, type RunStatus } from "../contracts";
import { packFor, type PayLine } from "../packs";
import { amt, dayOf, iso, levelOf, monthLabel, prevMonth, read, type Level } from "./read";
import { totalsByCostCentre, type CostCentreTotal, type Totals } from "./totals";

// 014 T1, T5: every read of a run is shaped by the viewer's level (read.ts). "pay" gets every amount;
// "totals" (Finance) gets totals by entity and cost centre and nothing per person; "status" (HR) gets
// the steps and the changes with their amounts masked; anyone else gets a ForbiddenError. Every pay
// field name below is in PAY_FIELDS, which the read tools declare as `sensitive`, so the AI gateway
// redacts them per the tenant's policy wherever they go.
export const PAY_FIELDS = {
  gross: "pay", deductions: "pay", net: "pay", employer: "pay", amount: "pay", was: "pay", now: "pay", total: "pay", value: "pay",
} as const;

type Pay = string | Masked;
export type StepView = { key: RunStatus; label: string; state: "done" | "now" | "todo"; at: string | null; by: string | null };
export type ChangeRow = {
  id: string; personId: string; personName: string; initials: string; kind: "joiner" | "leaver" | "pay";
  amount: Pay; was: Pay; now: Pay; explanation: string; needsCheck: boolean; confidence: number;
  status: "accepted" | "open" | "queried" | "dismissed" | "expired" | "explaining"; decidedBy: string | null; suggestionId: string | null;
};
export type PayslipRow = { id: string; personId: string; personName: string; initials: string; employeeNo: string; costCentre: string; gross: string; deductions: string; net: string; flags: string[]; change: ChangeRow["status"] | null };
export type NextStep = { step: RunStatus; label: string; prompt: string; enabled: boolean; hint: string | null } | null;
export type RunView = {
  id: string; level: Level; payGroup: { id: string; name: string }; legalEntityId: string; entityName: string; currency: string;
  period: string; periodLabel: string; previousLabel: string; status: RunStatus; steps: StepView[]; headcount: number;
  pack: { id: string; label: string; fictional: boolean } | null; sources: Record<string, string>;
  totals?: Totals & { people: number }; previousGross?: string | null; costCentres?: CostCentreTotal[];
  breakdown?: { label: string; amount: string }[]; statutory?: { label: string; payee: string; amount: string; dueOn: string }[]; filings?: { label: string; dueOn: string }[];
  trend?: { period: string; label: string; gross: string }[];
  changes?: ChangeRow[]; open?: number; payslips?: PayslipRow[];
  bankFile: { suggestionId: string | null; status: string | null; firstApprovedBy: string | null } | null;
  next: NextStep;
};

const initialsOf = (name: string) => name.trim().split(/\s+/).map((p) => p[0]).join("").slice(0, 2).toUpperCase();
const named = (col: string) => sql.raw(`(select u.name from auth.user u where 'user:' || u.id::text = split_part(${col}, ' for ', 1))`);

const RUN = sql`select r.*, to_char(r.period, 'YYYY-MM') as month, g.name as group_name, e.name as entity_name,
    ${named("r.drafted_by")} as drafted_name, ${named("r.checked_by")} as checked_name, ${named("r.hr_approved_by")} as hr_name,
    ${named("r.finance_approved_by")} as finance_name, ${named("r.bank_file_by")} as bank_name, ${named("r.sent_by")} as sent_name,
    (select count(*) from payroll.payslip p where p.run_id = r.id)::int as headcount
  from payroll.run r join payroll.pay_group g on g.id = r.pay_group_id join core.legal_entity e on e.id = r.legal_entity_id`;

const who = (id: unknown, name: unknown) => (id ? ((name as string | null) ?? (String(id).startsWith("job:") ? "amax" : String(id))) : null);

function stepsOf(r: Record<string, unknown>): StepView[] {
  const done = STEPS.indexOf(r.status as RunStatus);
  const at: Record<RunStatus, [unknown, unknown, unknown]> = {
    draft: [r.drafted_at, r.drafted_by, r.drafted_name], checked: [r.checked_at, r.checked_by, r.checked_name], hr_approved: [r.hr_approved_at, r.hr_approved_by, r.hr_name],
    finance_approved: [r.finance_approved_at, r.finance_approved_by, r.finance_name], bank_file: [r.bank_file_at, r.bank_file_by, r.bank_name], payslips_sent: [r.sent_at, r.sent_by, r.sent_name],
  };
  return STEPS.map((k, i) => ({ key: k, label: STEP_LABELS[k], state: i <= done ? "done" : i === done + 1 ? "now" : "todo", at: i <= done ? iso(at[k][0]) : null, by: i <= done ? who(at[k][1], at[k][2]) : null }));
}

/** The latest variance suggestion per change, from 006, for its status (open, queried, dismissed, expired). */
async function suggestionsFor(tx: Tx, ids: string[]) {
  if (!ids.length) return new Map<string, { id: string; status: string }>();
  const rows = await tx.execute(sql`select distinct on (target_id) target_id, id, case when status in ('open', 'queried') and expires_at < now() then 'expired' else status end as status
    from agents.suggestion where kind = 'payroll.variance' and target_type = 'payroll.change' and target_id in (${sql.join(ids.map((i) => sql`${i}`), sql`, `)}) order by target_id, created_at desc`);
  return new Map(rows.map((r) => [r.target_id as string, { id: r.id as string, status: r.status as string }]));
}

async function changesOf(tx: Tx, v: Viewer, runId: string): Promise<ChangeRow[]> {
  const rows = await tx.execute(sql`select c.*, ${named("c.decided_by")} as decided_name from payroll.change c where c.run_id = ${runId} order by c.needs_check desc, c.decision nulls first, c.person_name`);
  const sugg = await suggestionsFor(tx, rows.map((r) => r.id as string));
  return rows.map((c) => {
    const s = sugg.get(c.id as string);
    const status: ChangeRow["status"] = c.decision === "accepted" ? "accepted" : !s ? "explaining" : s.status === "queried" ? "queried" : s.status === "dismissed" ? "dismissed" : s.status === "expired" ? "expired" : "open";
    const row = {
      id: c.id as string, personId: c.person_id as string, personName: c.person_name as string, initials: initialsOf(c.person_name as string), kind: c.kind as ChangeRow["kind"],
      amount: amt(c.amount), was: amt(c.was_net), now: amt(c.now_net), explanation: c.explanation as string, needsCheck: Boolean(c.needs_check), confidence: Number(c.confidence),
      status, decidedBy: who(c.decided_by, c.decided_name), suggestionId: s?.id ?? null,
    };
    // HR (status level) reads the explanation; the amounts are masked unless it's their own pay (002 `self`).
    return mask(v, row, { amount: "pay", was: "pay", now: "pay" }, { legalEntityId: c.legal_entity_id as string, ownerUserId: (c.user_id as string | null) ?? null }) as ChangeRow;
  });
}

async function packRun(tx: Tx, r: Record<string, unknown>) {
  try {
    const pack = packFor(r.pack as string);
    const lines = await tx.execute(sql`select s.person_id, l.code, l.label, l.kind, l.amount, l.basis from payroll.payslip_line l join payroll.payslip s on s.id = l.payslip_id where s.run_id = ${r.id} order by s.person_id, l.position`);
    const by = new Map<string, PayLine[]>();
    for (const l of lines) by.set(l.person_id as string, [...(by.get(l.person_id as string) ?? []), { code: l.code as string, label: l.label as string, kind: l.kind as PayLine["kind"], amount: moneyOf(String(l.amount), r.currency as string), basis: (l.basis as string | null) ?? null }]);
    const [e] = await tx.execute(sql`select country from core.legal_entity where id = ${r.legal_entity_id}`);
    const month = r.month as string;
    const run = { legalEntityId: r.legal_entity_id as string, country: e.country as string, currency: r.currency as string, period: { month, from: `${month}-01`, to: dayOf(r.period_end)! }, payslips: [...by].map(([personId, l]) => ({ personId, lines: l })) };
    return { pack, statutory: pack.statutory(run), filings: pack.filings(run) };
  } catch {
    return null;
  }
}

function nextOf(v: Viewer, r: Record<string, unknown>, open: number, month: string, entity: string): NextStep {
  const le = { legalEntityId: r.legal_entity_id as string };
  const when = `the ${month} payroll run for ${entity}`;
  switch (r.status as RunStatus) {
    case "draft": return { step: "checked", label: "Run the agent check", prompt: `Run the agent variance check on ${when}`, enabled: can(v, "payroll:run:check", le), hint: can(v, "payroll:run:check", le) ? null : "Payroll runs the agent check" };
    case "checked": {
      const hint = open ? `Resolve the ${open} open change${open === 1 ? "" : "s"} to approve the run` : can(v, "payroll:run:approve-hr", le) ? null : "HR approves this step";
      return { step: "hr_approved", label: "Approve run", prompt: `Approve ${when} for HR`, enabled: !open && can(v, "payroll:run:approve-hr", le), hint };
    }
    case "hr_approved": return { step: "finance_approved", label: "Approve totals", prompt: `Approve the totals of ${when} for Finance`, enabled: can(v, "payroll:run:approve-finance", le), hint: can(v, "payroll:run:approve-finance", le) ? null : "Finance approves the totals" };
    case "finance_approved": return { step: "bank_file", label: "Approve bank file", prompt: `Approve the bank file for ${when}`, enabled: can(v, "payroll:bank-file:approve", le), hint: "Two people approve the bank file; it can't be undone" };
    case "bank_file": return { step: "payslips_sent", label: "Send payslips", prompt: `Send the payslips for ${when}`, enabled: can(v, "payroll:payslips:send", le), hint: can(v, "payroll:payslips:send", le) ? null : "Payroll sends payslips" };
    default: return null;
  }
}

async function view(tx: Tx, v: Viewer, r: Record<string, unknown>): Promise<RunView | null> {
  const level = levelOf(v, r.legal_entity_id as string);
  if (!level) return null;
  const month = r.month as string;
  const out: RunView = {
    id: r.id as string, level, payGroup: { id: r.pay_group_id as string, name: r.group_name as string }, legalEntityId: r.legal_entity_id as string, entityName: r.entity_name as string,
    currency: r.currency as string, period: month, periodLabel: monthLabel(month), previousLabel: monthLabel(prevMonth(month)), status: r.status as RunStatus, steps: stepsOf(r),
    headcount: Number(r.headcount), pack: null, sources: (r.sources as Record<string, string>) ?? {}, bankFile: null, next: null,
  };
  try {
    const p = packFor(r.pack as string);
    out.pack = { id: p.id, label: p.label, fictional: Boolean(p.fictional) };
  } catch { /* the pack isn't installed: the run still reads */ }
  const [bf] = await tx.execute(sql`select s.id, s.status, ${named("s.first_approved_by")} as first_name, s.first_approved_by from agents.suggestion s
    where s.kind = 'payroll.bank-file' and s.target_type = 'payroll.run' and s.target_id = ${out.id} order by s.created_at desc limit 1`);
  out.bankFile = bf ? { suggestionId: bf.id as string, status: bf.status as string, firstApprovedBy: who(bf.first_approved_by, bf.first_name) } : null;
  if (level === "pay" || level === "totals") {
    const t = await totalsByCostCentre(tx, out.id, out.currency, level === "totals");
    out.totals = t.total;
    out.costCentres = t.costCentres;
    const trend = await tx.execute(sql`select to_char(r.period, 'YYYY-MM') as month, coalesce((select sum(p.gross) from payroll.payslip p where p.run_id = r.id), 0) as gross
      from payroll.run r where r.pay_group_id = ${out.payGroup.id} and r.period <= ${`${month}-01`} order by r.period desc limit 6`);
    out.trend = trend.reverse().map((x) => ({ period: x.month as string, label: monthLabel(x.month as string).split(" ")[0].slice(0, 3), gross: amt(x.gross) }));
    out.previousGross = out.trend.length > 1 && out.trend.at(-2)!.period === prevMonth(month) ? out.trend.at(-2)!.gross : null;
    const parts = await tx.execute(sql`select l.code, min(l.label) as label, sum(l.amount) as amount from payroll.payslip_line l join payroll.payslip s on s.id = l.payslip_id
      where s.run_id = ${out.id} and l.kind = 'deduction' group by l.code order by sum(l.amount) desc`);
    out.breakdown = [{ label: "Net pay", amount: t.total.net }, ...parts.map((x) => ({ label: (x.label as string).replace(/,? \d+(\.\d+)?%$/, "").replace(/, \d+(\.\d+)? (h|days?)$/, ""), amount: amt(x.amount) }))];
    const s = await packRun(tx, { ...r, month });
    out.statutory = s?.statutory.map((x) => ({ label: x.label, payee: x.payee, amount: amt(x.amount.amount), dueOn: x.dueOn })) ?? [];
    out.filings = s?.filings.map((x) => ({ label: x.label, dueOn: x.dueOn })) ?? [];
  }
  if (level === "pay" || level === "status") {
    out.changes = await changesOf(tx, v, out.id);
    out.open = out.changes.filter((c) => c.status !== "accepted").length;
  } else {
    const [o] = await tx.execute(sql`select count(*)::int as n from payroll.change where run_id = ${out.id} and decision is null`);
    out.open = Number(o.n);
  }
  if (level === "pay") {
    const slips = await tx.execute(sql`select * from payroll.payslip where run_id = ${out.id} order by person_name`);
    out.payslips = slips.map((s) => ({
      id: s.id as string, personId: s.person_id as string, personName: s.person_name as string, initials: initialsOf(s.person_name as string), employeeNo: s.employee_no as string,
      costCentre: s.cost_centre as string, gross: amt(s.gross), deductions: amt(s.deductions), net: amt(s.net), flags: (s.flags as string[]) ?? [],
      change: out.changes!.find((c) => c.personId === s.person_id)?.status ?? null,
    }));
  }
  out.next = nextOf(v, r, out.open ?? 0, out.periodLabel.split(" ")[0], out.entityName);
  return out;
}

/** Runs the viewer may see, newest first, each shaped by their level. */
export const listRuns = (v: Viewer) => read(v, async (tx) => {
  const rows = await tx.execute(sql`${RUN} order by r.period desc, e.name`);
  const out: RunView[] = [];
  for (const r of rows) {
    const x = await view(tx, v, r);
    if (x) out.push({ ...x, changes: undefined, payslips: undefined, trend: undefined, breakdown: undefined, costCentres: undefined });
  }
  return out;
});

/** One run by id, shaped by the viewer's level; null when there's none they may see. */
export const getRun = (v: Viewer, runId: string) => read(v, async (tx) => {
  const [r] = await tx.execute(sql`${RUN} where r.id = ${runId}`);
  return r ? view(tx, v, r) : null;
});

/** The run the screen opens on: the newest not yet paid, else the newest. */
export const currentRun = (v: Viewer) => read(v, async (tx) => {
  const rows = (await tx.execute(sql`${RUN} order by (r.status = 'payslips_sent'), r.period desc`)).filter((r) => levelOf(v, r.legal_entity_id as string));
  return rows[0] ? view(tx, v, rows[0]) : null;
});

/** One explained change; amounts as the viewer may see them. */
export const getChange = (v: Viewer, changeId: string) => read(v, async (tx) => {
  const [c] = await tx.execute(sql`select c.run_id, c.legal_entity_id, to_char(r.period, 'YYYY-MM') as month from payroll.change c join payroll.run r on r.id = c.run_id where c.id = ${changeId}`);
  const level = c ? levelOf(v, c.legal_entity_id as string) : null;
  if (!c || (level !== "pay" && level !== "status")) return null;
  const row = (await changesOf(tx, v, c.run_id as string)).find((x) => x.id === changeId)!;
  return { ...row, runId: c.run_id as string, period: c.month as string, periodLabel: monthLabel(c.month as string) };
});

export type PayslipView = {
  id: string; runId: string; personName: string; employeeNo: string; costCentre: string; period: string; periodLabel: string; currency: string; status: RunStatus;
  workingDays: number; daysPaid: number; gross: string; deductions: string; net: string; employer: string; flags: string[];
  lines: { label: string; kind: PayLine["kind"]; amount: string; basis: string | null }[]; pack: string | null; own: boolean;
};

async function payslipRow(tx: Tx, v: Viewer, s: Record<string, unknown>): Promise<PayslipView | null> {
  const own = !!s.user_id && s.user_id === v.userId;
  // 014 AC-3: Payroll and Admin read any payslip; a person reads their own once it has been sent.
  if (levelOf(v, s.legal_entity_id as string) !== "pay" && !(own && s.status === "payslips_sent")) return null;
  const lines = await tx.execute(sql`select * from payroll.payslip_line where payslip_id = ${s.id} order by position`);
  let pack: string | null = null;
  try { pack = packFor(s.pack as string).label; } catch { /* not installed */ }
  return {
    id: s.id as string, runId: s.run_id as string, personName: s.person_name as string, employeeNo: s.employee_no as string, costCentre: s.cost_centre as string,
    period: s.month as string, periodLabel: monthLabel(s.month as string), currency: s.currency as string, status: s.status as RunStatus,
    workingDays: Number(s.working_days), daysPaid: Number(s.days_paid), gross: amt(s.gross), deductions: amt(s.deductions), net: amt(s.net), employer: amt(s.employer_cost), flags: (s.flags as string[]) ?? [],
    lines: lines.map((l) => ({ label: l.label as string, kind: l.kind as PayLine["kind"], amount: amt(l.amount), basis: (l.basis as string | null) ?? null })), pack, own,
  };
}
const SLIP = sql`select s.*, r.status, r.pack, to_char(r.period, 'YYYY-MM') as month from payroll.payslip s join payroll.run r on r.id = s.run_id`;

/** One payslip with its lines: Payroll and Admin, or its person once sent. Null otherwise. */
export const getPayslip = (v: Viewer, payslipId: string) => read(v, async (tx) => {
  const [s] = await tx.execute(sql`${SLIP} where s.id = ${payslipId}`);
  return s ? payslipRow(tx, v, s) : null;
}, "payroll:payslip:read");

/** The viewer's own sent payslips, newest first. */
export const myPayslips = (v: Viewer) => read(v, async (tx) => {
  const rows = await tx.execute(sql`${SLIP} where s.user_id = ${v.userId} and r.status = 'payslips_sent' order by r.period desc`);
  const out: PayslipView[] = [];
  for (const s of rows) { const p = await payslipRow(tx, v, s); if (p) out.push(p); }
  return out;
}, "payroll:payslip:read");

/** Throws unless the viewer may open the payroll screen for some entity. */
export function assertReads(v: Viewer) {
  if (!can(v, "payroll:read")) throw new ForbiddenError("payroll:read", "payroll");
}
