import { z } from "zod";
import type { McpToolDef } from "@amax/core";
import type { Viewer } from "@amax/auth";
import { ctxFor } from "./server/context";
import { approveWeek, rejectWeek, remindWeek } from "./server/decide";
import { logTime } from "./server/log";
import { myWeek } from "./server/my";
import { reopenWeek } from "./server/reopen";
import { submitWeek } from "./server/submit";
import { teamWeek } from "./server/team";
import { wantedWeek } from "./server/weeks";

type Src = "mcp" | "chat";
const tool = <I extends z.ZodType>(t: Omit<McpToolDef, "input" | "run"> & { input: I; run: (v: Viewer, input: z.infer<I>, source: Src) => Promise<unknown> }) => t as unknown as McpToolDef;
const read = { scope: "read" as const, readOnly: true, permission: "time:read" };
const week = z.string().regex(/^\d{4}-W\d{2}$/).optional().describe("ISO week such as 2026-W42; the latest week if left out");
const ref = z.object({ weekId: z.string().uuid().optional(), person: z.string().optional().describe("Name or email"), week });

export const mcpTools: McpToolDef[] = [
  tool({ ...read, name: "get_team_week", description: "Team timesheets for a week: hours per day, share logged by agents, status, and who you can approve.", input: z.object({ week }),
    run: (v, a) => teamWeek(v, wantedWeek(a.week)) }),
  tool({ ...read, name: "get_my_week", description: "Your own timesheet for a week, by project and day, with its status.", input: z.object({ week }),
    run: (v, a) => myWeek(v, wantedWeek(a.week)) }),
  tool({ name: "log_time", description: "Log hours against a project for a weekday (Monday to Friday, YYYY-MM-DD in the person's own calendar). Time logged through MCP counts as agent time.", scope: "write", permission: "time:log",
    input: z.object({ projectKey: z.string(), hours: z.number().positive().max(24), day: z.string().describe("YYYY-MM-DD, the person's local date"), billable: z.boolean().optional(), note: z.string().optional(), agent: z.string().optional() }),
    run: (v, a, s = "mcp") => logTime(ctxFor(v, s), { ...a, source: s === "mcp" ? "agent" : "person" }) }),
  tool({ name: "submit_week", description: "Submit your timesheet for a week for approval.", scope: "write", permission: "time:submit", input: z.object({ week }),
    run: (v, a, s = "mcp") => submitWeek(ctxFor(v, s), a) }),
  tool({ name: "approve_week", description: "Approve a submitted timesheet. Approved weeks are locked.", scope: "write", permission: "time:approve", input: ref,
    run: (v, a, s = "mcp") => approveWeek(ctxFor(v, s), a) }),
  tool({ name: "reject_week", description: "Send a submitted timesheet back with a comment saying what to fix.", scope: "write", permission: "time:approve", input: ref.extend({ comment: z.string() }),
    run: (v, a, s = "mcp") => rejectWeek(ctxFor(v, s), a) }),
  tool({ name: "remind_week", description: "Record a reminder for someone to submit their timesheet. It is an event only: nothing delivers it until notifications (030) is installed, so tell the person yourself if it is urgent.", scope: "write", permission: "time:approve", input: ref,
    run: (v, a, s = "mcp") => remindWeek(ctxFor(v, s), a) }),
  tool({ name: "reopen_week", description: "Unlock an approved timesheet so it can change. Admin only; give a reason.", scope: "write", permission: "time:admin", input: ref.extend({ reason: z.string() }),
    run: (v, a, s = "mcp") => reopenWeek(ctxFor(v, s), a) }),
];
