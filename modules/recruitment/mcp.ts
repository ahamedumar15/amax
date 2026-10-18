import { z } from "zod";
import type { McpToolDef, SearchHit } from "@amax/core";
import type { Viewer } from "@amax/auth";
import { appOf, roleOf } from "./pins";
import { addApplication, CvSection, moveApplication, rejectApplication } from "./server/applications";
import { recordInterview } from "./server/interviews";
import { checkOffer, sendOffer } from "./server/offers";
import { CANDIDATE_SENSITIVE, getApplication, getRole, pipelineView } from "./server/queries";
import { ctxFor } from "./server/read";
import { openRole, RoleInput } from "./server/roles";

// MCP tools (004): the same queries and services as the screen, so permissions and audit match. Every
// read that can return candidate data declares it `sensitive` (002 `candidate`), so the AI gateway
// redacts it per the tenant's policy; the reads already mask it for anyone but HR.
type Src = "mcp" | "chat";
const tool = <I extends z.ZodType>(t: Omit<McpToolDef, "input" | "run"> & { input: I; run: (v: Viewer, input: z.infer<I>, source: Src) => Promise<unknown> }) => t as unknown as McpToolDef;
const read = { scope: "read" as const, readOnly: true, permission: "recruitment:read", sensitive: CANDIDATE_SENSITIVE };
const write = (permission: string) => ({ scope: "write" as const, permission });
const applicationId = z.uuid().describe("The application's id, from list_recruitment or get_role");

export const mcpTools: McpToolDef[] = [
  tool({ ...read, pin: "view", name: "list_recruitment", description: "The hiring pipeline: open roles, candidates by stage (Applied, Screening, Interviews, Offer, Hired this quarter), the funnel this quarter, time to hire, offers accepted and hires per month. Optionally one role. Candidate names only for HR.",
    input: z.object({ roleId: z.uuid().optional() }), run: (v, a) => pipelineView(v, a.roleId) }),
  tool({ ...read, pin: { id: "roleId", of: roleOf as never }, name: "get_role", description: "One role: openings, the skills the screening agent looks for, who raised it and why, and its applications by stage.",
    input: z.object({ roleId: z.uuid() }), run: (v, a) => getRole(v, a.roleId) }),
  tool({ ...read, pin: { id: "applicationId", of: appOf as never }, name: "get_application", description: "One application: stage and when each was reached, the screening agent's match score with its evidence (CV sections), interviews and the offer. CV and name for HR only.",
    input: z.object({ applicationId }), run: (v, a) => getApplication(v, a.applicationId) }),
  tool({ ...write("recruitment:role:manage"), name: "open_role", description: "Open a role to hire for: title, department, legal entity, openings and the skills the screening agent should look for.",
    input: RoleInput, service: openRole, run: (v, a, s = "mcp") => openRole(ctxFor(v, s), a) }),
  tool({ ...write("recruitment:candidate:manage"), name: "add_application", description: "Add a candidate's application to an open role, with their CV as sections (heading and text). The screening agent then suggests a match score.",
    input: z.object({ roleId: z.uuid(), name: z.string(), email: z.string().optional(), source: z.string(), cv: z.array(CvSection).default([]) }), sensitive: { name: "candidate", email: "candidate", cv: "candidate" },
    service: addApplication, run: (v, a, s = "mcp") => addApplication(ctxFor(v, s), a) }),
  tool({ ...write("recruitment:candidate:manage"), name: "move_application", description: "Move an application on: from Applied to Screening, or from Screening to Interviews.",
    input: z.object({ applicationId, to: z.enum(["screening", "interview"]) }), service: moveApplication, run: (v, a, s = "mcp") => moveApplication(ctxFor(v, s), a) }),
  tool({ ...write("recruitment:candidate:manage"), name: "record_interview", description: "Schedule an interview round (with its time) or record its outcome (passed or failed).",
    input: z.object({ applicationId, round: z.number().int().min(1).max(6), at: z.string().optional(), outcome: z.enum(["passed", "failed"]).optional() }), service: recordInterview, run: (v, a, s = "mcp") => recordInterview(ctxFor(v, s), a) }),
  tool({ ...write("recruitment:candidate:manage"), destructive: true, name: "reject_application", description: "Reject an application, with a sentence why. Only a person can: an agent's match score is never a rejection.",
    input: z.object({ applicationId, note: z.string() }), service: rejectApplication, run: (v, a, s = "mcp") => rejectApplication(ctxFor(v, s), a) }),
  tool({ ...write("recruitment:offer:send"), name: "send_offer", description: "Send the offer for e-signature after the interviews: Zoho Sign by default, or the demo provider (fictional, sends nothing).",
    input: z.object({ applicationId, startsOn: z.string(), provider: z.string().optional() }), service: sendOffer, run: (v, a, s = "mcp") => sendOffer(ctxFor(v, s), a) }),
  tool({ ...write("recruitment:offer:send"), name: "check_offer_signature", description: "Ask the e-signature provider whether the offer is signed. Signed: the candidate is hired and HR is asked to add them to HR records.",
    input: z.object({ offerId: z.uuid() }), service: checkOffer, run: (v, a, s = "mcp") => checkOffer(ctxFor(v, s), a) }),
];

export async function search(viewer: Viewer, query: string): Promise<SearchHit[]> {
  if (!/recruit|hiring|candidate|role|vacanc|opening/i.test(query)) return [];
  const p = await pipelineView(viewer).catch(() => null);
  return (p?.roles ?? []).map((r) => ({ type: "role", id: r.id, title: `${r.title} (${r.openings} open)`, url: `/recruitment?role=${r.id}`, summary: r.department })).slice(0, 10);
}
