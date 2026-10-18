import { z } from "zod";
import type { McpToolDef, SearchHit } from "@amax/core";
import type { Viewer } from "@amax/auth";
import { KINDS } from "./contracts";
import { checklistOf, taskOf } from "./pins";
import { startChecklist } from "./server/checklists";
import { ctxFor } from "./server/context";
import { issueExitLink } from "./server/exit";
import { getChecklist, getTask, listChecklists, onboardingSummary } from "./server/queries";
import { today } from "./server/read";
import { completeTask } from "./server/tasks";

// MCP tools (004): the same queries and services as the screen, so permissions and audit match.
type Src = "mcp" | "chat";
const tool = <I extends z.ZodType>(t: Omit<McpToolDef, "input" | "run"> & { input: I; run: (v: Viewer, input: z.infer<I>, source: Src) => Promise<unknown> }) => t as unknown as McpToolDef;
const read = { scope: "read" as const, readOnly: true, permission: "onboarding:read" };
const write = (permission: string) => ({ scope: "write" as const, permission });
const checklistId = z.string().uuid().describe("The checklist's id, from list_checklists");

export const mcpTools: McpToolDef[] = [
  tool({ ...read, pin: "view", name: "list_checklists", description: "Joiner and leaver checklists, soonest start first, each with its tasks by owner (HR, IT Admin, the manager), what's done and what's overdue.",
    input: z.object({ kind: z.enum(KINDS).optional(), open: z.boolean().optional().describe("Only checklists not yet complete") }),
    run: (v, a) => listChecklists(v, today(), a) }),
  tool({ ...read, pin: { id: "checklistId", of: checklistOf }, name: "get_checklist", description: "One person's joiner or leaver checklist by id: every task with its owner, due date and who completed it, and the exit questionnaire's state.",
    input: z.object({ checklistId }), run: (v, a) => getChecklist(v, a.checklistId, today()) }),
  tool({ ...read, pin: { id: "taskId", of: taskOf }, name: "get_checklist_task", description: "One checklist task by id: what it is, whose checklist, who owns it, when it's due and whether it's done.",
    input: z.object({ taskId: z.string().uuid() }), run: (v, a) => getTask(v, a.taskId, today()) }),
  tool({ ...read, pin: "view", name: "onboarding_summary", description: "What needs attention: overdue checklist tasks, joiners starting in the next 30 days and leavers leaving this week.",
    input: z.object({}), run: (v) => onboardingSummary(v, today()) }),
  tool({ ...write("onboarding:task:complete"), name: "complete_checklist_task", description: "Tick off a checklist task you own (HR any task, IT Admin the IT tasks, a manager their own), with an optional note. Completing an IT access task records that IT did it; it grants or revokes nothing itself.",
    input: z.object({ taskId: z.string().uuid(), note: z.string().max(500).optional() }), service: completeTask, run: (v, a, s = "mcp") => completeTask(ctxFor(v, s), a) }),
  tool({ ...write("onboarding:checklist:start"), name: "start_checklist", description: "Start a joiner or leaver checklist for someone by employee number, when HR's joined or left event didn't (they were recorded before onboarding was installed). A second start returns the first checklist.",
    input: z.object({ employeeNo: z.string().describe("Employee number, e.g. LL-0640"), kind: z.enum(KINDS) }), service: startChecklist,
    run: (v, a, s = "mcp") => startChecklist(ctxFor(v, s), { personId: a.employeeNo, kind: a.kind }) }),
  tool({ ...write("onboarding:exit:send"), name: "send_exit_questionnaire", description: "Make a leaver's exit questionnaire link to send them. It works once, for 14 days; a new link replaces an unanswered one. The link is shown only now, so pass it on.",
    input: z.object({ checklistId }), service: issueExitLink, run: (v, a, s = "mcp") => issueExitLink(ctxFor(v, s), a) }),
];

export async function search(viewer: Viewer, query: string): Promise<SearchHit[]> {
  const q = query.toLowerCase();
  return (await listChecklists(viewer, today())).filter((c) => `${c.personName} ${c.employeeNo} ${c.kind}`.toLowerCase().includes(q))
    .map((c) => ({ type: "checklist", id: c.id, title: `${c.personName}, ${c.kind}`, url: "/onboarding", summary: `${c.done} of ${c.tasks.length} tasks done` })).slice(0, 20);
}
