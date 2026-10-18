import { z } from "zod";
import type { McpToolDef, SearchHit } from "@amax/core";
import type { Viewer } from "@amax/auth";
import { CONTRACTS, EMPLOYMENT_SENSITIVE } from "./contracts";
import { personOf } from "./pins";
import { ctxFor } from "./server/context";
import { getPersonView, listDirectory } from "./server/queries";
import { peopleStats } from "./server/stats";
import { addPerson, changePerson, recordLeaver } from "./server/services";
import { changeInput } from "./server/change";

// MCP tools (004): the same queries and services as the screens, so masking, permissions and audit match.
type Src = "mcp" | "chat";
const tool = <I extends z.ZodType>(t: Omit<McpToolDef, "input" | "run"> & { input: I; run: (v: Viewer, input: z.infer<I>, source: Src) => Promise<unknown> }) => t as unknown as McpToolDef;
const read = { scope: "read" as const, readOnly: true, permission: "hr:read" };

export const mcpTools: McpToolDef[] = [
  tool({ ...read, pin: "view", name: "list_people", description: "The people directory: name, title, department, entity, manager and status. Optional search text.",
    input: z.object({ q: z.string().optional(), limit: z.number().int().min(1).max(200).optional() }), run: (v, a) => listDirectory(v, a) }),
  tool({ ...read, pin: { id: "personId", of: personOf }, name: "get_person", description: "One person's record by personId or employee number (e.g. LL-0417): employment, documents and probation. Pay and bank details are masked unless your role may see them.",
    sensitive: EMPLOYMENT_SENSITIVE, input: z.object({ personId: z.string().uuid().optional(), employeeNo: z.string().optional() }), run: (v, a) => getPersonView(v, a) }),
  tool({ ...read, pin: "view", name: "people_stats", description: "Headcount by entity and department, joiners and leavers by month this year, probation and missing documents.",
    input: z.object({}), run: (v) => peopleStats(v) }),
  tool({ name: "add_person", description: "Add a person to HR records. Entity is Sri Lanka or Australia (or the entity's name). A future join date makes them 'joining'.", scope: "write", permission: "hr:person:create",
    input: z.object({ name: z.string(), title: z.string(), department: z.string(), entity: z.string(), joinedOn: z.string(), managerEmployeeNo: z.string().optional(),
      contract: z.enum(CONTRACTS).optional(), fte: z.number().optional(), grade: z.string().optional(), workEmail: z.string().optional() }),
    run: (v, a, s = "mcp") => addPerson(ctxFor(v, s), a) }),
  tool({ name: "change_person", description: "Change a person's department, grade, manager, contract, FTE or review date from an effective date (default today), or their title, location or work email (today only).", scope: "write",
    permission: "hr:person:update", input: changeInput.omit({ baseSalary: true }), run: (v, a, s = "mcp") => changePerson(ctxFor(v, s), a) }),
  tool({ name: "record_leaver", description: "Record that a person leaves on a date. Their employment ends that day.", scope: "write", destructive: true, permission: "hr:person:leave",
    input: z.object({ employeeNo: z.string(), leftOn: z.string(), reason: z.string().optional() }), run: (v, a, s = "mcp") => recordLeaver(ctxFor(v, s), a) }),
];

// Contribution to the built-in search tool.
export async function search(viewer: Viewer, query: string): Promise<SearchHit[]> {
  const { rows } = await listDirectory(viewer, { q: query, limit: 10 });
  return rows.map((p) => ({ type: "person", id: p.employeeNo, title: p.name, url: `/hr/p/${p.employeeNo}`, summary: `${p.title}, ${p.department ?? ""}` }));
}
