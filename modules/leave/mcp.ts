import { z } from "zod";
import type { McpToolDef } from "@amax/core";
import type { Viewer } from "@amax/auth";
import { LEAVE_SENSITIVE, LEAVE_TYPES } from "./contracts";
import { cancelLeave } from "./server/cancel";
import { ctxFor } from "./server/context";
import { approveLeave, rejectLeave } from "./server/decide";
import { leaveCalendar, leaveOverview } from "./server/overview";
import { applyCountryPack } from "./server/policies";
import { requestLeave } from "./server/request";
import { getLeaveRequest, listHolidays, myLeave } from "./server/view";

type Src = "mcp" | "chat";
const tool = <I extends z.ZodType>(t: Omit<McpToolDef, "input" | "run"> & { input: I; run: (v: Viewer, input: z.infer<I>, source: Src) => Promise<unknown> }) => t as unknown as McpToolDef;
const read = { scope: "read" as const, readOnly: true, permission: "leave:read" };
const month = z.string().regex(/^\d{4}-\d{2}$/).optional().describe("Month such as 2026-10; this month if left out");
const requestId = z.string().uuid().describe("The request's id, from get_leave_overview or get_my_leave");
const date = z.string().describe("YYYY-MM-DD");

export const mcpTools: McpToolDef[] = [
  tool({ ...read, name: "get_leave_overview", description: "Leave at a glance: who is on leave today, requests waiting for you with their release clash checks, days booked this month, unused annual leave, leave by type and per month, and the team calendar.",
    input: z.object({ month }), run: (v, a) => leaveOverview(v, a.month) }),
  tool({ ...read, name: "get_team_calendar", description: "The team calendar for a month: each person's leave by day, pending requests, holidays. Give userId for one person's row.",
    input: z.object({ month, userId: z.string().uuid().optional() }), run: (v, a) => leaveCalendar(v, a.month, a.userId) }),
  tool({ ...read, name: "get_leave_request", description: "One leave request with its status, days and release clash check. Medical reasons and certificates show only to HR and the person.",
    sensitive: LEAVE_SENSITIVE, input: z.object({ requestId }), run: (v, a) => getLeaveRequest(v, a.requestId) }),
  tool({ ...read, name: "get_my_leave", description: "Your own leave balances this year and your requests.", sensitive: LEAVE_SENSITIVE, input: z.object({}), run: (v) => myLeave(v) }),
  tool({ ...read, name: "list_holidays", description: "Public and Poya holidays from the country packs, for a country (LK, AU) and year.",
    input: z.object({ country: z.string().length(2).optional(), year: z.number().int().optional() }), run: (v, a) => listHolidays(v, a) }),
  tool({ name: "request_leave", description: "Request leave from startsOn to endsOn (inclusive, YYYY-MM-DD). Working days only count; give halfDay am or pm for half a day. Says whether it clashes with a release. HR may name another person by employee number or name.",
    scope: "write", permission: "leave:request", sensitive: LEAVE_SENSITIVE,
    input: z.object({ type: z.enum(LEAVE_TYPES), startsOn: date, endsOn: date.optional(), halfDay: z.enum(["am", "pm"]).optional(), note: z.string().optional(),
      medicalReason: z.string().optional().describe("Medical leave only; HR and the person see it"), certificateRef: z.string().optional(), person: z.string().optional() }),
    run: (v, a, s = "mcp") => requestLeave(ctxFor(v, s), a) }),
  tool({ name: "approve_leave", description: "Approve a pending leave request. You approve your reports' requests (HR approves anyone's in their entities), never your own.", scope: "write", permission: "leave:approve",
    input: z.object({ requestId }), run: (v, a, s = "mcp") => approveLeave(ctxFor(v, s), a) }),
  tool({ name: "reject_leave", description: "Reject a pending leave request with a comment saying why.", scope: "write", permission: "leave:approve",
    input: z.object({ requestId, comment: z.string() }), run: (v, a, s = "mcp") => rejectLeave(ctxFor(v, s), a) }),
  tool({ name: "cancel_leave", description: "Cancel a pending or approved leave request: your own until it has ended, or anyone's in your entities if you are HR.", scope: "write", destructive: true, permission: "leave:cancel",
    input: z.object({ requestId }), run: (v, a, s = "mcp") => cancelLeave(ctxFor(v, s), a) }),
  tool({ name: "apply_leave_pack", description: "Install a legal entity's leave types and holidays from its country pack (Sri Lanka, Australia). HR only; safe to re-run.", scope: "write", permission: "leave:admin",
    input: z.object({ entity: z.string().describe("Legal entity name or id") }), run: (v, a, s = "mcp") => applyCountryPack(ctxFor(v, s), a) }),
];
