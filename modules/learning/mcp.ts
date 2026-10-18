import { z } from "zod";
import type { McpToolDef, SearchHit } from "@amax/core";
import type { Viewer } from "@amax/auth";
import { certificationOf, programmeOf } from "./pins";
import { ctxFor } from "./server/context";
import { recordCertification, remindCertification } from "./server/certifications";
import { enrolPeople, recordCompletion } from "./server/enrolment";
import { createProgramme, day, newProgramme } from "./server/programmes";
import { getProgramme, listCertifications, listProgrammes } from "./server/queries";
import { today } from "./server/read";
import { learningStats } from "./server/stats";

// MCP tools (004): the same queries and services as the screen, so permissions and audit match.
type Src = "mcp" | "chat";
const tool = <I extends z.ZodType>(t: Omit<McpToolDef, "input" | "run"> & { input: I; run: (v: Viewer, input: z.infer<I>, source: Src) => Promise<unknown> }) => t as unknown as McpToolDef;
const read = { scope: "read" as const, readOnly: true, permission: "learning:read" };
const write = (permission: string) => ({ scope: "write" as const, permission });
const programmeId = z.string().uuid().describe("The programme's id, from list_programmes");
const employeeNo = z.string().describe("Employee number, e.g. LL-0417");

export const mcpTools: McpToolDef[] = [
  tool({ ...read, pin: "view", name: "list_programmes", description: "Learning programmes with type, people enrolled, average completion, hours spent and whether each is planned, running or done.",
    input: z.object({ status: z.enum(["planned", "running", "done"]).optional() }),
    run: async (v, a) => (await listProgrammes(v, today())).filter((p) => !a.status || p.status === a.status) }),
  tool({ ...read, pin: { id: "programmeId", of: programmeOf }, name: "get_programme", description: "One programme by id, with each participant's progress and completion date.",
    input: z.object({ programmeId }), run: (v, a) => getProgramme(v, a.programmeId, today()) }),
  tool({ ...read, pin: "view", name: "learning_summary", description: "This year's learning figures: programmes, people in optional programmes, completion rate against its target, certifications and people taking part each month.",
    input: z.object({}), run: (v) => learningStats(v, today()) }),
  tool({ ...read, pin: "view", name: "list_certifications", description: "Certifications people hold, soonest expiry first. Give expiringBy to keep those lapsing by that date, or employeeNo for one person.",
    input: z.object({ expiringBy: day.optional(), employeeNo: employeeNo.optional() }),
    run: (v, a) => listCertifications(v, { on: today(), until: a.expiringBy, employeeNo: a.employeeNo }) }),
  tool({ ...read, pin: { id: "certificationId", of: certificationOf }, name: "get_certification", description: "One certification by id: who holds it, when it was issued, when it expires and the last reminder.",
    input: z.object({ certificationId: z.string().uuid() }), run: async (v, a) => (await listCertifications(v, { on: today(), certificationId: a.certificationId }))[0] ?? null }),
  tool({ ...write("learning:programme:create"), name: "create_programme", description: "Add a learning programme: a certification cohort, workshop, compliance course, leadership programme or course, run internally or externally.",
    input: newProgramme, run: (v, a, s = "mcp") => createProgramme(ctxFor(v, s), a) }),
  tool({ ...write("learning:enrol"), name: "enrol_in_programme", description: "Enrol people in a programme by employee number, or everyone active (for a mandatory course). People already enrolled are skipped.",
    input: z.object({ programmeId, employeeNos: z.array(employeeNo).optional(), everyone: z.boolean().optional() }), run: (v, a, s = "mcp") => enrolPeople(ctxFor(v, s), a) }),
  tool({ ...write("learning:enrol"), name: "record_completion", description: "Record that someone completed a programme (progress 100, the default), or their progress so far, with any hours they spent that day.",
    input: z.object({ programmeId, employeeNo, progress: z.number().int().min(0).max(100).optional(), on: day.optional(), hours: z.number().positive().max(24).optional() }),
    run: (v, a, s = "mcp") => recordCompletion(ctxFor(v, s), a) }),
  tool({ ...write("learning:certification:record"), name: "record_certification", description: "Record a certification someone holds, with its issuer, issue date and expiry. Reminders go out 60 and 14 days before it expires.",
    input: z.object({ employeeNo, name: z.string(), issuer: z.string().optional(), issuedOn: day, expiresOn: day.optional(), programmeId: programmeId.optional() }),
    run: (v, a, s = "mcp") => recordCertification(ctxFor(v, s), a) }),
  tool({ ...write("learning:remind"), name: "remind_certification", description: "Remind the holder now that their certification expires soon, on top of the scheduled reminders.",
    input: z.object({ certificationId: z.string().uuid() }), run: (v, a, s = "mcp") => remindCertification(ctxFor(v, s), a) }),
];

export async function search(viewer: Viewer, query: string): Promise<SearchHit[]> {
  const q = query.toLowerCase();
  return (await listProgrammes(viewer, today())).filter((p) => `${p.number} ${p.title} ${p.kind}`.toLowerCase().includes(q))
    .map((p) => ({ type: "programme", id: p.id, title: p.title, url: "/learning", summary: `${p.kind}, ${p.people} people, ${p.completion}% complete` })).slice(0, 20);
}
