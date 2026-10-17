import { z } from "zod";
import type { McpToolDef } from "@amax/core";
import type { Viewer } from "@amax/auth";
import { ctxFor } from "./server/context";
import { forecastFor } from "./server/forecast";
import { gridFor } from "./server/grid";
import { teamFor } from "./server/team";
import { allocate, copyMonth } from "./server/services";

// MCP tools (004): the same reads and services as the screen, so permissions and audit match.
type Src = "mcp" | "chat";
const tool = <I extends z.ZodType>(t: Omit<McpToolDef, "input" | "run"> & { input: I; run: (v: Viewer, input: z.infer<I>, source: Src) => Promise<unknown> }) => t as unknown as McpToolDef;
const read = { scope: "read" as const, readOnly: true, permission: "allocations:read" };

export const mcpTools: McpToolDef[] = [
  tool({ ...read, name: "get_capacity_forecast", description: "Capacity against demand (FTE) for the next six months, and who is on the bench each month with their skill.",
    input: z.object({ team: z.string().optional() }), run: (v, a) => forecastFor(v, a) }),
  tool({ ...read, name: "list_allocations", description: "Per-person monthly allocations for the next five months on the projects you manage (or everyone), with totals and capacity.",
    input: z.object({ everyone: z.boolean().optional() }), run: (v, a) => gridFor(v, a) }),
  tool({ ...read, name: "get_project_team", description: "Who is allocated to a project (key such as CON) this month and the next two, with role and percent per month; optionally one person by employee number.",
    input: z.object({ projectKey: z.string(), person: z.string().optional() }),
    run: async (v, a) => { const t = await teamFor(v, a.projectKey); return t && a.person ? { ...t, people: t.people.filter((p) => p.employeeNo === a.person) } : t; } }),
  tool({ name: "allocate", description: "Allocate a person (employee number or full name) to a project key, or to other work, for a month or a range of months (YYYY-MM). Percent 0 removes it.",
    scope: "write", permission: "allocations:allocate",
    input: z.object({ person: z.string(), projectKey: z.string().optional(), work: z.string().optional(), month: z.string(), through: z.string().optional(), percent: z.number().int() }),
    run: (v, a, s = "mcp") => allocate(ctxFor(v, s), a) }),
  tool({ name: "copy_allocations_to_next_month", description: "Copy a month's allocations into the month after, leaving anything already planned there.", scope: "write", permission: "allocations:copy",
    input: z.object({ from: z.string(), team: z.string().optional() }), run: (v, a, s = "mcp") => copyMonth(ctxFor(v, s), a) }),
];
