import { z } from "zod";
import type { McpToolDef, SearchHit } from "@amax/core";
import type { Viewer } from "@amax/auth";
import { changeOf, payslipOf, runOf } from "./pins";
import { getChange, getPayslip, getRun, listRuns, myPayslips, PAY_FIELDS } from "./server/queries";
import { ctxFor } from "./server/read";
import { approveRunFinance, approveRunHr, checkRun, draftRun, sendPayslips } from "./server/runs";

// MCP tools (004): the same queries and services as the screen, so permissions and audit match.
// Every read that can return pay declares PAY_FIELDS as `sensitive`, so the AI gateway redacts them per
// the tenant's policy; the reads themselves already hold pay back from anyone below the "pay" level.
type Src = "mcp" | "chat";
const tool = <I extends z.ZodType>(t: Omit<McpToolDef, "input" | "run"> & { input: I; run: (v: Viewer, input: z.infer<I>, source: Src) => Promise<unknown> }) => t as unknown as McpToolDef;
const read = (permission = "payroll:read") => ({ scope: "read" as const, readOnly: true, permission, sensitive: PAY_FIELDS });
const write = (permission: string) => ({ scope: "write" as const, permission });
const runId = z.uuid().describe("The run's id, from list_payroll_runs");

export const mcpTools: McpToolDef[] = [
  tool({ ...read(), pin: "view", name: "list_payroll_runs", description: "Payroll runs by legal entity and month, newest first: each run's step (Draft, Agent check, HR approval, Finance approval, Bank file, Payslips sent), and, if you may see them, its totals. Never a person's pay unless you are Payroll or Admin.",
    input: z.object({}), run: (v) => listRuns(v) }),
  tool({ ...read(), pin: { id: "runId", of: runOf as never }, name: "get_payroll_run", description: "One payroll run: its steps with who took each, and what your role may see of it. Payroll and Admin: totals, changes since last period with the agent's explanations, and every payslip. Finance: totals by entity and cost centre only. HR: the steps and the changes' explanations, amounts hidden.",
    input: z.object({ runId }), run: (v, a) => getRun(v, a.runId) }),
  tool({ ...read(), pin: { id: "changeId", of: changeOf as never }, name: "get_pay_change", description: "One change since last period found by the payroll agent: whose pay, why it changed and whether it's accepted, queried or open. Accept or query it with accept_agent_suggestion or query_agent_suggestion and its suggestionId.",
    input: z.object({ changeId: z.uuid() }), run: (v, a) => getChange(v, a.changeId) }),
  tool({ ...read("payroll:payslip:read"), pin: { id: "payslipId", of: payslipOf as never }, name: "get_payslip", description: "One payslip with its earnings, deductions and the employer's contributions. Payroll and Admin may read any; anyone may read their own once it has been sent.",
    input: z.object({ payslipId: z.uuid() }), run: (v, a) => getPayslip(v, a.payslipId) }),
  tool({ ...read("payroll:payslip:read"), pin: "view", name: "my_payslips", description: "Your own payslips that have been sent, newest first.",
    input: z.object({}), run: (v) => myPayslips(v) }),
  tool({ ...write("payroll:run:draft"), name: "draft_payroll_run", description: "Draft (or redraft, before HR approval) a pay group's run for a month: base salary from HR, unpaid leave from Leave, overtime from approved timesheets when Time is installed, and the group's own components, calculated by its country pack.",
    input: z.object({ payGroupId: z.uuid().describe("The pay group's id, from list_payroll_runs"), period: z.string().describe("The month, e.g. 2026-11") }), service: draftRun,
    run: (v, a, s = "mcp") => draftRun(ctxFor(v, s), a) }),
  tool({ ...write("payroll:run:check"), name: "check_payroll_run", description: "Run the payroll agent's variance check on a drafted run: every person whose net pay changed since last period gets an explained change to accept or query.",
    input: z.object({ runId }), service: checkRun, run: (v, a, s = "mcp") => checkRun(ctxFor(v, s), a) }),
  tool({ ...write("payroll:run:approve-hr"), name: "approve_payroll_run_hr", description: "HR approves a checked run. Refused while any change since last period is open, queried or dismissed.",
    input: z.object({ runId }), service: approveRunHr, run: (v, a, s = "mcp") => approveRunHr(ctxFor(v, s), a) }),
  tool({ ...write("payroll:run:approve-finance"), name: "approve_payroll_run_finance", description: "Finance approves an HR-approved run's totals by entity and cost centre. Then the payroll agent proposes the bank file for two approvers.",
    input: z.object({ runId }), service: approveRunFinance, run: (v, a, s = "mcp") => approveRunFinance(ctxFor(v, s), a) }),
  tool({ ...write("payroll:payslips:send"), name: "send_payslips", description: "Send a run's payslips once its bank file is made: each person can then read their own.",
    input: z.object({ runId }), service: sendPayslips, run: (v, a, s = "mcp") => sendPayslips(ctxFor(v, s), a) }),
];

export async function search(viewer: Viewer, query: string): Promise<SearchHit[]> {
  const q = query.toLowerCase();
  if (!/payroll|payslip|salary|pay\b/.test(q)) return [];
  return (await listRuns(viewer).catch(() => [])).map((r) => ({ type: "payroll-run", id: r.id, title: `${r.entityName} payroll, ${r.periodLabel}`, url: `/payroll?run=${r.id}`, summary: r.steps.find((s) => s.state === "now")?.label ?? "Payslips sent" })).slice(0, 10);
}
