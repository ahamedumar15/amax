import { sql } from "drizzle-orm";
import { z } from "zod";
import type { Tx } from "@amax/db";
import { assertCan, viewerOf } from "@amax/auth";
import { defineService, type ServiceContext } from "@amax/core/server";
import { listPeople } from "@amax/hr/contracts";
import { EVENTS, STEP_LABELS, type PayslipsSent, type RunChecked, type RunStatus, type RunStepped } from "../contracts";
import { buildDraft, groupOf, type DraftSlip, type Group, type Sources } from "./draft";
import { actorOf, dayOf, periodOf } from "./read";
import { totalsByCostCentre } from "./totals";
import { varianceOf } from "./variance";

// 014 AC-1: each step of a run is its own audited service. A run moves only forward, one step at a
// time, and each step records who took it and when. No result or event carries a person's pay.
export type RunRow = Record<string, unknown> & { id: string; pay_group_id: string; legal_entity_id: string; period: string; status: RunStatus; currency: string };

export async function lockRun(tx: Tx, runId: string): Promise<RunRow> {
  const [r] = await tx.execute(sql`select *, to_char(period, 'YYYY-MM-DD') as period_day from payroll.run where id = ${runId} for update`);
  if (!r) throw new Error("no such payroll run");
  return { ...r, period: r.period_day } as RunRow;
}

function expect(run: RunRow, from: RunStatus[], doing: string) {
  if (!from.includes(run.status)) throw new Error(`can't ${doing}: the run is at "${STEP_LABELS[run.status]}"`);
}

/** The viewer acting (if any) must hold the step's permission in the run's legal entity. */
function mayStep(ctx: ServiceContext, action: string, legalEntityId: string) {
  const v = viewerOf(ctx);
  if (v) assertCan(v, action, { legalEntityId });
}

export const stepped = (run: RunRow, status: RunStatus, by: string): RunStepped => ({ runId: run.id, payGroupId: run.pay_group_id, legalEntityId: run.legal_entity_id, period: run.period.slice(0, 7), status, by });

/** Writes a drafted run's payslips and lines, replacing any earlier draft of the same run. */
export async function writeDraft(tx: Tx, tenantId: string, g: Group, month: string, slips: DraftSlip[], sources: Sources, by: string) {
  const p = periodOf(month);
  const [run] = await tx.execute(sql`insert into payroll.run (tenant_id, pay_group_id, legal_entity_id, period, period_end, currency, pack, status, sources, drafted_by)
    values (${tenantId}, ${g.id}, ${g.legal_entity_id}, ${p.from}, ${p.to}, ${g.currency}, ${g.pack}, 'draft', ${JSON.stringify(sources)}::jsonb, ${by})
    on conflict (pay_group_id, period) do update set status = 'draft', sources = excluded.sources, drafted_by = excluded.drafted_by, drafted_at = now(), checked_by = null, checked_at = null
    returning id`);
  await tx.execute(sql`delete from payroll.change where run_id = ${run.id}`);
  await tx.execute(sql`delete from payroll.payslip where run_id = ${run.id}`);
  for (const s of slips) {
    const [slip] = await tx.execute(sql`insert into payroll.payslip (tenant_id, run_id, legal_entity_id, person_id, user_id, person_name, employee_no, cost_centre, currency, working_days, days_paid,
        gross, deductions, net, employer_cost, flags, period_end)
      values (${tenantId}, ${run.id}, ${g.legal_entity_id}, ${s.person.id}, ${s.person.userId}, ${s.person.name}, ${s.person.employeeNo}, ${s.costCentre}, ${g.currency}, ${s.workingDays}, ${s.daysPaid},
        ${s.totals.gross.amount}, ${s.totals.deductions.amount}, ${s.totals.net.amount}, ${s.totals.employer.amount}, ${`{${s.flags.join(",")}}`}, ${p.to}) returning id`);
    for (const [i, l] of s.lines.entries()) {
      await tx.execute(sql`insert into payroll.payslip_line (tenant_id, payslip_id, legal_entity_id, person_id, position, code, label, kind, amount, basis, period_end)
        values (${tenantId}, ${slip.id}, ${g.legal_entity_id}, ${s.person.id}, ${i + 1}, ${l.code}, ${l.label}, ${l.kind}, ${l.amount.amount}, ${l.basis ?? null}, ${p.to})`);
    }
  }
  return run.id as string;
}

/** The agent check: records every change since the last paid run. An accepted change whose amount is the same is kept; the rest are explained afresh. */
export async function recordChanges(tx: Tx, ctx: ServiceContext, run: RunRow, by: string) {
  const people = new Map((await listPeople(tx, ctx, { ids: (await tx.execute(sql`select person_id from payroll.payslip where run_id = ${run.id}
      union select person_id from payroll.payslip where run_id = (select id from payroll.run where pay_group_id = ${run.pay_group_id} and period < ${run.period} and status = 'payslips_sent' order by period desc limit 1)`)).map((r) => r.person_id as string) }))
    .map((p) => [p.id, { joinedOn: p.joinedOn, leftOn: p.leftOn }]));
  const { changes } = await varianceOf(tx, run, people);
  const kept = await tx.execute(sql`select person_id, amount from payroll.change where run_id = ${run.id} and decision = 'accepted'`);
  const keep = new Set(kept.filter((k) => changes.some((c) => c.personId === k.person_id && Number(c.amount) === Number(k.amount))).map((k) => k.person_id as string));
  await tx.execute(sql`delete from payroll.change where run_id = ${run.id} ${keep.size ? sql`and person_id::text not in (${sql.join([...keep].map((k) => sql`${k}`), sql`, `)})` : sql``}`);
  for (const c of changes.filter((x) => !keep.has(x.personId))) {
    await tx.execute(sql`insert into payroll.change (tenant_id, run_id, legal_entity_id, person_id, user_id, person_name, kind, was_net, now_net, amount, currency, explanation, needs_check, confidence)
      values (${ctx.tenantId}, ${run.id}, ${run.legal_entity_id}, ${c.personId}, ${c.userId}, ${c.personName}, ${c.kind}, ${c.was}, ${c.now}, ${c.amount}, ${run.currency}, ${c.explanation}, ${c.needsCheck}, ${c.confidence})`);
  }
  await tx.execute(sql`update payroll.run set status = 'checked', checked_by = ${by}, checked_at = now() where id = ${run.id}`);
  return changes.length;
}

const runId = z.object({ runId: z.uuid().describe("The run's id, from list_payroll_runs") });

export const draftRun = defineService({
  scoped: true,
  name: "payroll.run.draft",
  action: "payroll:run:draft",
  resource: "payroll.run",
  input: z.object({ payGroupId: z.uuid().describe("The pay group's id, from list_payroll_runs"), period: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/).describe("The month, e.g. 2026-11") }),
  async run(tx, input, ctx) {
    const g = await groupOf(tx, input.payGroupId);
    if (!g) throw new Error("no such pay group");
    mayStep(ctx, "payroll:run:draft", g.legal_entity_id);
    const [had] = await tx.execute(sql`select status from payroll.run where pay_group_id = ${g.id} and period = ${`${input.period}-01`} for update`);
    if (had && had.status !== "draft" && had.status !== "checked") throw new Error(`the ${input.period} run is past HR approval, so it can't be drafted again`);
    const { slips, sources } = await buildDraft(tx, ctx, g, input.period);
    const by = actorOf(ctx);
    const id = await writeDraft(tx, ctx.tenantId, g, input.period, slips, sources, by);
    const run = { id, pay_group_id: g.id, legal_entity_id: g.legal_entity_id, period: `${input.period}-01` } as RunRow;
    return { result: { runId: id, period: input.period, payslips: slips.length, status: "draft" as RunStatus, sources }, resourceId: id,
      before: had ? { status: had.status } : null, after: { period: input.period, payslips: slips.length, sources }, events: [{ name: EVENTS.runDrafted, payload: stepped(run, "draft", by) }] };
  },
});

export const checkRun = defineService({
  scoped: true,
  name: "payroll.run.check",
  action: "payroll:run:check",
  resource: "payroll.run",
  input: runId,
  async run(tx, { runId }, ctx) {
    const run = await lockRun(tx, runId);
    mayStep(ctx, "payroll:run:check", run.legal_entity_id);
    expect(run, ["draft", "checked"], "run the agent check");
    const by = actorOf(ctx);
    const changes = await recordChanges(tx, ctx, run, by);
    const payload: RunChecked = { ...stepped(run, "checked", by), changes };
    return { result: { runId, status: "checked" as RunStatus, changes }, resourceId: runId, before: { status: run.status }, after: { status: "checked", changes }, events: [{ name: EVENTS.runChecked, payload }] };
  },
});

/** Changes not yet accepted (open, queried, dismissed or expired suggestions): each one blocks HR approval. */
export async function unresolved(tx: Tx, runId: string) {
  const [r] = await tx.execute(sql`select count(*)::int as n from payroll.change where run_id = ${runId} and decision is null`);
  return Number(r.n);
}

export const approveRunHr = defineService({
  scoped: true,
  name: "payroll.run.approve-hr",
  action: "payroll:run:approve-hr",
  resource: "payroll.run",
  input: runId,
  async run(tx, { runId }, ctx) {
    const run = await lockRun(tx, runId);
    mayStep(ctx, "payroll:run:approve-hr", run.legal_entity_id);
    expect(run, ["checked"], "approve the run for HR");
    const open = await unresolved(tx, runId);
    // 014 AC-2: no approval while any change since last period is open or queried.
    if (open) throw new Error(`${open} change${open === 1 ? " is" : "s are"} still open; accept or resolve every change before approving the run`);
    const by = actorOf(ctx);
    await tx.execute(sql`update payroll.run set status = 'hr_approved', hr_approved_by = ${by}, hr_approved_at = now() where id = ${runId}`);
    return { result: { runId, status: "hr_approved" as RunStatus }, resourceId: runId, before: { status: run.status }, after: { status: "hr_approved" }, events: [{ name: EVENTS.runHrApproved, payload: stepped(run, "hr_approved", by) }] };
  },
});

export const approveRunFinance = defineService({
  scoped: true,
  name: "payroll.run.approve-finance",
  action: "payroll:run:approve-finance",
  resource: "payroll.run",
  input: runId,
  async run(tx, { runId }, ctx) {
    const run = await lockRun(tx, runId);
    mayStep(ctx, "payroll:run:approve-finance", run.legal_entity_id);
    expect(run, ["hr_approved"], "approve the run for Finance");
    const by = actorOf(ctx);
    await tx.execute(sql`update payroll.run set status = 'finance_approved', finance_approved_by = ${by}, finance_approved_at = now() where id = ${runId}`);
    // Finance approves totals by entity and cost centre: that is all the result says.
    const t = await totalsByCostCentre(tx, runId, run.currency, true);
    return { result: { runId, status: "finance_approved" as RunStatus, currency: run.currency, totals: t.total, costCentres: t.costCentres }, resourceId: runId,
      before: { status: run.status }, after: { status: "finance_approved" }, events: [{ name: EVENTS.runFinanceApproved, payload: stepped(run, "finance_approved", by) }] };
  },
});

export const sendPayslips = defineService({
  scoped: true,
  name: "payroll.payslips.send",
  action: "payroll:payslips:send",
  resource: "payroll.run",
  input: runId,
  async run(tx, { runId }, ctx) {
    const run = await lockRun(tx, runId);
    mayStep(ctx, "payroll:payslips:send", run.legal_entity_id);
    expect(run, ["bank_file"], "send payslips");
    const by = actorOf(ctx);
    await tx.execute(sql`update payroll.run set status = 'payslips_sent', sent_by = ${by}, sent_at = now() where id = ${runId}`);
    const slips = await tx.execute(sql`select user_id from payroll.payslip where run_id = ${runId}`);
    const payload: PayslipsSent = { ...stepped(run, "payslips_sent", by), payslips: slips.length, userIds: slips.flatMap((s) => (s.user_id ? [s.user_id as string] : [])) };
    return { result: { runId, status: "payslips_sent" as RunStatus, payslips: slips.length, paidOn: dayOf(run.period_end) }, resourceId: runId,
      before: { status: run.status }, after: { status: "payslips_sent", payslips: slips.length }, events: [{ name: EVENTS.payslipsSent, payload }] };
  },
});
