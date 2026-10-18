import { z } from "zod";
import type { McpToolDef } from "@amax/core";
import type { Viewer } from "@amax/auth";
import { careerOf, eventOf } from "./pins";
import { getCareer, getCareerEvent } from "./server/queries";
import { ctxFor, READ, TAG } from "./server/read";
import { tagTechnology } from "./server/tag";

// MCP tools (004): the same reads and service as the screen, so permissions and audit match.
type Src = "mcp" | "chat";
const tool = <I extends z.ZodType>(t: Omit<McpToolDef, "input" | "run"> & { input: I; run: (v: Viewer, input: z.infer<I>, source: Src) => Promise<unknown> }) => t as unknown as McpToolDef;
const read = { scope: "read" as const, readOnly: true, permission: READ };
const personId = z.string().uuid().describe("The person's id, from get_person");

export const mcpTools: McpToolDef[] = [
  tool({ ...read, pin: { id: "personId", of: careerOf }, name: "get_career",
    description: "One person's career, oldest first: joining, grade changes (never pay), manager and department moves, projects with their allocation and technologies, certifications, and technologies the agent proposed. Each event says who recorded it. Give personId or employeeNo (e.g. LL-0417); since (YYYY-MM-DD) keeps what happened from then on.",
    input: z.object({ personId: personId.optional(), employeeNo: z.string().optional(), since: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional() }),
    run: (v, a) => getCareer(v, a) }),
  tool({ ...read, pin: { id: "eventId", of: eventOf }, name: "get_career_event",
    description: "One event of a person's career by id, from get_career: what changed (before and after), when it took effect, who recorded it (a person, or an agent for a person), who approved it and its source record.",
    input: z.object({ personId, eventId: z.string().uuid() }), run: (v, a) => getCareerEvent(v, a) }),
  tool({ scope: "write", permission: TAG, name: "tag_technology",
    description: "Tag a technology on one of a person's projects: confirms the agent's proposed tag, or adds it. project is the project's name or delivery key as get_career shows it.",
    input: z.object({ personId: z.string().describe("The person's id or employee number"), project: z.string(), technology: z.string() }),
    service: tagTechnology, run: (v, a, s = "mcp") => tagTechnology(ctxFor(v, s), a) }),
];
