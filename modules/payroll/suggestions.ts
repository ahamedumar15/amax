import { createHash } from "node:crypto";
import { sql } from "drizzle-orm";
import { z } from "zod";
import type { EventHandlerDef } from "@amax/core";
import { contextFor } from "@amax/core/server";
import { defineSuggestionKind } from "@amax/agents";
import { createSuggestion, SuggestionError } from "@amax/agents/server";
import { EVENTS, type RunChecked, type RunStepped } from "./contracts";
import { amt, actorOf, monthLabel } from "./server/read";
import { lockRun, stepped } from "./server/runs";

// 014 AC-2: the payroll agent explains every change since last period as a 006 suggestion. Accepting
// one marks the change accepted (as the person, audited under payroll.change.accept); querying or
// dismissing leaves it undecided, and HR can't approve the run while any change is undecided. The
// amount is a `pay` field, masked for anyone who may not see pay (HR reads the explanation only).
const Variance = z.object({ changeId: z.uuid(), runId: z.uuid(), personName: z.string(), amount: z.string(), currency: z.string() });
type Variance = z.infer<typeof Variance>;

const AGENT = "Payroll agent";

export const variance = defineSuggestionKind<Variance, { at: string }>({
  kind: "payroll.variance",
  title: "Pay change since last period",
  permission: "payroll:change:decide",
  proposed: Variance,
  fields: { amount: "pay" },
  sensitive: true,
  async apply(tx, ctx, p) {
    const run = await lockRun(tx, p.runId);
    if (run.status !== "checked") throw new SuggestionError("the run has moved past the agent check; run the check again to decide changes");
    const [c] = await tx.execute(sql`select * from payroll.change where id = ${p.changeId} and run_id = ${p.runId} for update`);
    if (!c) throw new SuggestionError("that change was re-explained since; decide the newer suggestion");
    if (amt(c.amount) !== amt(p.amount)) throw new SuggestionError("that change's amount moved since; decide the newer suggestion");
    // Someone other than the person paid accepts a change to their pay.
    if (c.user_id && ctx.actor.id === `user:${c.user_id as string}`) throw new SuggestionError("someone else must accept a change to your own pay");
    await tx.execute(sql`update payroll.change set decision = 'accepted', decided_by = ${actorOf(ctx)}, decided_at = now() where id = ${c.id}`);
    return { applied: { at: new Date().toISOString() }, action: "payroll.change.accept", resource: "payroll.change", resourceId: c.id as string, before: { decision: null }, after: { decision: "accepted", personName: p.personName } };
  },
  async undo(tx, ctx, p) {
    const run = await lockRun(tx, p.runId);
    if (run.status !== "checked") throw new SuggestionError("HR has approved the run since, so this change can't be reopened");
    await tx.execute(sql`update payroll.change set decision = null, decided_by = null, decided_at = null where id = ${p.changeId}`);
    return { applied: null, action: "payroll.change.reopen", resource: "payroll.change", resourceId: p.changeId, before: { decision: "accepted" }, after: { decision: null, by: actorOf(ctx) } };
  },
});

// 014 AC-1: the bank file is irreversible once it goes to the bank: two different people with
// payroll:bank-file:approve approve it, the second makes it, and there is no undo.
const BankFile = z.object({ runId: z.uuid(), period: z.string(), rows: z.number().int().min(0), total: z.string(), currency: z.string() });
type BankFile = z.infer<typeof BankFile>;

export const bankFile = defineSuggestionKind<BankFile, { digest: string }>({
  kind: "payroll.bank-file",
  title: "Payroll bank file",
  permission: "payroll:bank-file:approve",
  proposed: BankFile,
  fields: { total: "pay" },
  sensitive: true,
  irreversible: true,
  async apply(tx, ctx, p) {
    const run = await lockRun(tx, p.runId);
    if (run.status !== "finance_approved") throw new SuggestionError(`the run isn't waiting for its bank file (it's ${run.status.replace("_", " ")})`);
    const slips = await tx.execute(sql`select employee_no, net from payroll.payslip where run_id = ${p.runId} order by employee_no`);
    const [t] = await tx.execute(sql`select coalesce(sum(net), 0) as total from payroll.payslip where run_id = ${p.runId}`);
    if (slips.length !== p.rows || amt(t.total) !== amt(p.total)) throw new SuggestionError("the run changed since this bank file was proposed");
    // The file's lines are the employee number and net pay; account numbers are joined from hr at the bank connector (031), so they never sit here.
    const digest = createHash("sha256").update(slips.map((s) => `${s.employee_no as string},${amt(s.net)}`).join("\n")).digest("hex");
    const by = actorOf(ctx);
    const [f] = await tx.execute(sql`insert into payroll.bank_file (tenant_id, run_id, legal_entity_id, rows, total, currency, digest, approved_by)
      values (${ctx.tenantId}, ${p.runId}, ${run.legal_entity_id}, ${p.rows}, ${p.total}, ${p.currency}, ${digest}, ${by}) returning id`);
    await tx.execute(sql`update payroll.run set status = 'bank_file', bank_file_by = ${by}, bank_file_at = now() where id = ${p.runId}`);
    return { applied: { digest }, action: "payroll.run.bank-file", resource: "payroll.run", resourceId: p.runId, before: { status: run.status }, after: { status: "bank_file", bankFileId: f.id, rows: p.rows, digest },
      events: [{ name: EVENTS.bankFileApproved, payload: stepped(run, "bank_file", by) }] };
  },
});

/** After the agent check: one suggestion per change, made by the payroll agent for no one in particular. */
export const varianceAgent: EventHandlerDef = {
  id: "payroll.variance-agent",
  event: EVENTS.runChecked,
  async handle({ tx, tenantId, event }) {
    const e = event.payload as RunChecked;
    const rows = await tx.execute(sql`select c.*, r.period from payroll.change c join payroll.run r on r.id = c.run_id where c.run_id = ${e.runId} and c.decision is null order by c.needs_check desc, c.person_name`);
    const ctx = contextFor.job(tenantId, "payroll.variance-agent");
    for (const c of rows) {
      const month = monthLabel(String(e.period));
      await createSuggestion(ctx, {
        kind: variance.kind, target: { type: "payroll.change", id: c.id as string, label: `${c.person_name as string}, ${month} payroll` },
        title: `${c.person_name as string}: pay changed since last period`, detail: c.explanation as string,
        proposed: { changeId: c.id, runId: e.runId, personName: c.person_name, amount: amt(c.amount), currency: c.currency },
        confidence: Number(c.confidence), agentName: AGENT, scope: { legalEntityId: e.legalEntityId, ownerUserId: (c.user_id as string | null) ?? null },
        evidence: [{ type: "record", label: `${month} payslip`, ref: `/payroll?run=${e.runId}` }],
      });
    }
  },
};

/** After Finance approves: the bank file, proposed for two approvers. */
export const bankFileAgent: EventHandlerDef = {
  id: "payroll.bank-file-agent",
  event: EVENTS.runFinanceApproved,
  async handle({ tx, tenantId, event }) {
    const e = event.payload as RunStepped;
    const [t] = await tx.execute(sql`select count(*)::int as rows, coalesce(sum(net), 0) as total, max(currency) as currency from payroll.payslip where run_id = ${e.runId}`);
    const month = monthLabel(e.period);
    await createSuggestion(contextFor.job(tenantId, "payroll.bank-file-agent"), {
      kind: bankFile.kind, target: { type: "payroll.run", id: e.runId, label: `${month} bank file` },
      title: `Send the ${month} bank file`, detail: `Finance approved the ${month} totals. The bank file pays ${t.rows} people; it can't be undone once sent, so two people approve it.`,
      proposed: { runId: e.runId, period: e.period, rows: Number(t.rows), total: amt(t.total), currency: String(t.currency ?? "") },
      confidence: 1, agentName: AGENT, scope: { legalEntityId: e.legalEntityId }, evidence: [{ type: "record", label: `${month} run`, ref: `/payroll?run=${e.runId}` }],
    });
  },
};
