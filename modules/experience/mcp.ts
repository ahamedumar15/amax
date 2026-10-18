import { z } from "zod";
import type { McpToolDef } from "@amax/core";
import type { Viewer } from "@amax/auth";
import { CHOICES, DIMENSIONS } from "./contracts";
import { fixOf } from "./pins";
import { CollectionInput, RemediationInput, setCollection, setRemediation } from "./server/collection";
import { getFix, myView } from "./server/fixes";
import { answerPulse, sendPulse } from "./server/pulse";
import { ADMIN, ANSWER, ctxFor, OWN, PULSE, READ } from "./server/read";
import { experienceView } from "./server/views";

// MCP tools (004): the same reads and services as the screen. No tool takes a person, and none
// returns one person's score but get_my_experience, which is only ever the caller's own (AC-3).
type Src = "mcp" | "chat";
const tool = <I extends z.ZodType>(t: Omit<McpToolDef, "input" | "run"> & { input: I; run: (v: Viewer, input: z.infer<I>, source: Src) => Promise<unknown> }) => t as unknown as McpToolDef;
const read = { scope: "read" as const, readOnly: true, permission: READ };
const write = (permission: string) => ({ scope: "write" as const, permission });

export const mcpTools: McpToolDef[] = [
  tool({ ...read, pin: "view", name: "get_experience", description: "Digital experience for the legal entities you may see: the experience score (40% device health, 40% app reliability, 20% pulse) by department, site or device model for groups of 5 or more people, devices needing attention, the top device and app issues, the experience agent's suggested fixes, the latest pulse survey and what is collected.",
    input: z.object({ by: z.enum(DIMENSIONS).optional() }), run: (v, a) => experienceView(v, a.by) }),
  tool({ ...read, pin: { id: "issueId", of: fixOf as never }, name: "get_experience_fix", description: "One suggested fix with its evidence: devices affected, first seen, the change that likely caused it, and any remediation run. Never which devices or whose.",
    input: z.object({ issueId: z.uuid() }), run: (v, a) => getFix(v, a.issueId) }),
  tool({ scope: "read", readOnly: true, permission: OWN, pin: "view", name: "get_my_experience", description: "Your own devices' health and app reliability, and your own experience score. Only ever yours.",
    input: z.object({}), run: (v) => myView(v) }),
  tool({ ...write(ADMIN), name: "set_experience_collection", description: "Switch device and app health collection on or off for one legal entity. Switching it on needs the date the notice to staff went out.",
    input: CollectionInput, service: setCollection, run: (v, a, s = "mcp") => setCollection(ctxFor(v, s), a) }),
  tool({ ...write(ADMIN), name: "set_experience_remediation", description: "Let approved Intune remediations run through the Microsoft Graph write registration (off by default), naming the Intune remediation script to run. While off, each approved one is left for IT to run in Intune.",
    input: RemediationInput, service: setRemediation, run: (v, a, s = "mcp") => setRemediation(ctxFor(v, s), a) }),
  tool({ ...write(PULSE), name: "send_pulse", description: "Send the one-question pulse survey, anonymous, to everyone in the entities where collection is on. At most one a fortnight.",
    input: z.object({ question: z.string().min(5).max(200).optional() }), service: sendPulse, run: (v, a, s = "mcp") => sendPulse(ctxFor(v, s), a) }),
  tool({ ...write(ANSWER), name: "answer_pulse", description: "Answer the pulse survey you were sent, anonymously: well, sometimes (gets in the way sometimes) or a-lot (gets in the way a lot).",
    input: z.object({ pulseId: z.uuid(), choice: z.enum(CHOICES) }), service: answerPulse, run: (v, a, s = "mcp") => answerPulse(ctxFor(v, s), a) }),
];
