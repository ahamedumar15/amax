import { z } from "zod";
import type { McpToolDef, SearchHit } from "@amax/core";
import type { Viewer } from "@amax/auth";
import { STAGES } from "./contracts";
import { itemOf as itemPinOf, opportunityOf } from "./pins";
import { ctxFor } from "./server/context";
import { openSuggestions, recordsOf } from "./server/detail";
import { promoteInput, promoteToDelivery } from "./server/promote";
import { getOpportunity, historyOf, listOpportunities } from "./server/queries";
import { addRisk, addTask, logActivity, setRiskStatus } from "./server/records";
import { createOpportunity, moveOpportunity, newOpportunity, removeOpportunity } from "./server/opportunities";
import { acceptSuggestion, dismissSuggestion } from "./server/suggestions";
import { opportunityChanges, updateOpportunity } from "./server/update";
import { pipelineStats } from "./server/stats";

// MCP tools (004): the same queries and services as the screens, so permissions and audit match.
type Src = "mcp" | "chat";
const tool = <I extends z.ZodType>(t: Omit<McpToolDef, "input" | "run"> & { input: I; run: (v: Viewer, input: z.infer<I>, source: Src) => Promise<unknown> }) => t as unknown as McpToolDef;
const read = { scope: "read" as const, readOnly: true, permission: "presales:read" };
const write = (permission: string) => ({ scope: "write" as const, permission });
const today = () => new Date().toISOString().slice(0, 10);
const number = z.string().describe("Opportunity number, e.g. PS-0142");

export const mcpTools: McpToolDef[] = [
  tool({ ...read, pin: "view", name: "list_opportunities", description: "Presales opportunities with stage, win chance, value (original currency and USD) and calculated health.", input: z.object({ open: z.boolean().optional() }),
    run: async (v, a) => (await listOpportunities(v, today())).filter((o) => !a.open || (o.stage !== "won" && o.stage !== "lost")) }),
  tool({ ...read, pin: { id: "opportunityId", of: opportunityOf }, name: "get_opportunity", description: "One opportunity, by opportunityId or number, with its stage history, activities, tasks and risks.",
    input: z.object({ opportunityId: z.string().uuid().optional(), number: number.optional() }),
    run: async (v, a) => { const o = await getOpportunity(v, a, today()); return o && { ...o, history: await historyOf(v, o.id), ...(await recordsOf(v, o.id)) }; } }),
  tool({ ...read, pin: { id: "id", of: itemPinOf }, name: "get_opportunity_item", description: "One activity, task or risk on an opportunity, by its id.", input: z.object({ number, id: z.string().uuid() }),
    run: async (v, a) => { const o = await getOpportunity(v, a.number, today()); return o && itemOf(await recordsOf(v, o.id), a.id, o.number); } }),
  tool({ ...read, pin: { id: "id", of: (s: { id: string; client: string } | null) => (s ? { id: s.id, label: `Inbox find: ${s.client}` } : null) }, name: "get_suggestion",
    description: "One opportunity the inbox agent found (client, summary, value, source); its text came from email or Teams.", input: z.object({ id: z.string().uuid() }),
    run: async (v, a) => (await openSuggestions(v)).find((s) => s.id === a.id) ?? null }),
  tool({ ...read, pin: "view", name: "pipeline_summary", description: "Open pipeline in USD, weighted by win chance, 12-month win rate and average days to close.", input: z.object({}), run: (v) => pipelineStats(v, today()) }),
  tool({ ...write("presales:opportunity:create"), name: "create_opportunity", description: "Add an opportunity. Value is in its own currency (USD by default); the pipeline converts it to USD.", input: newOpportunity,
    service: createOpportunity, run: (v, a, s = "mcp") => createOpportunity(ctxFor(v, s), a) }),
  tool({ ...write("presales:opportunity:edit"), name: "move_opportunity", description: `Move an opportunity to a stage (${STAGES.join(", ")}) or change its win chance. Lost needs a reason.`,
    input: z.object({ number, to: z.enum(STAGES), winChance: z.number().int().min(0).max(100).optional(), note: z.string().optional(), reason: z.string().optional(), competitor: z.string().optional() }),
    service: moveOpportunity, run: (v, a, s = "mcp") => moveOpportunity(ctxFor(v, s), a) }),
  tool({ ...write("presales:opportunity:edit"), name: "update_opportunity", description: "Change an open opportunity's details: title, value and currency, account manager, presales lead, service, cost centre, estimate, expected close, lead source, competitor or next step. Stage and win chance change with move_opportunity.",
    input: opportunityChanges, service: updateOpportunity, run: (v, a, s = "mcp") => updateOpportunity(ctxFor(v, s), a) }),
  tool({ ...write("presales:opportunity:edit"), name: "log_opportunity_activity", description: "Log a call, meeting, workshop, demo, proposal or email on an opportunity.",
    input: z.object({ number, title: z.string(), kind: z.enum(["call", "meeting", "workshop", "demo", "proposal", "email"]), on: z.string(), ownerName: z.string().optional(), note: z.string().optional(), progress: z.number().int().min(0).max(100).optional() }),
    service: logActivity, run: (v, a, s = "mcp") => logActivity(ctxFor(v, s), a) }),
  tool({ ...write("presales:opportunity:edit"), name: "add_opportunity_task", description: "Add a task to an opportunity.", input: z.object({ number, title: z.string(), ownerName: z.string().optional(), due: z.string().optional() }),
    service: addTask, run: (v, a, s = "mcp") => addTask(ctxFor(v, s), a) }),
  tool({ ...write("presales:opportunity:edit"), name: "add_opportunity_risk", description: "Add a risk, issue, assumption or decision. Open high-impact risks and issues change the calculated health.",
    input: z.object({ number, kind: z.enum(["risk", "issue", "assumption", "decision"]), title: z.string(), impact: z.enum(["low", "medium", "high"]).optional(), ownerName: z.string().optional() }),
    service: addRisk, run: (v, a, s = "mcp") => addRisk(ctxFor(v, s), a) }),
  tool({ ...write("presales:opportunity:edit"), name: "close_opportunity_risk", description: "Close a risk, issue or assumption on an opportunity. Closing open high-impact risks turns its health back to green.",
    input: z.object({ number, riskId: z.string().uuid() }), service: setRiskStatus, run: (v, a, s = "mcp") => setRiskStatus(ctxFor(v, s), { ...a, status: "closed" }) }),
  tool({ ...write("presales:opportunity:remove"), name: "remove_opportunity", description: "Remove an open opportunity that was a duplicate or a mistake. A lost deal is marked lost instead, so it counts in win rates.",
    input: z.object({ number }), service: removeOpportunity, run: (v, a, s = "mcp") => removeOpportunity(ctxFor(v, s), a) }),
  tool({ ...write("presales:opportunity:create"), name: "resolve_suggestion", description: "Accept an opportunity the inbox agent found (it becomes a new idea) or dismiss it.",
    input: z.object({ id: z.string().uuid(), decision: z.enum(["accept", "dismiss"]) }),
    service: [acceptSuggestion, dismissSuggestion], run: (v, a, s = "mcp") => (a.decision === "accept" ? acceptSuggestion : dismissSuggestion)(ctxFor(v, s), { id: a.id }) }),
  tool({ ...write("presales:promote"), name: "promote_opportunity", description: "Turn a won opportunity into a delivery project with the given key and billing.", input: promoteInput,
    // Three writes (claim, delivery's create, link) with presales' own idempotency: not one chat write (043).
    service: null, run: (v, a, s = "mcp") => promoteToDelivery(v, a, { source: s }) }),
];

function itemOf(r: Awaited<ReturnType<typeof recordsOf>>, id: string, number: string) {
  const found = ([["activity", r.activities], ["task", r.tasks], ["risk", r.risks]] as const).flatMap(([kind, rows]) => rows.filter((x) => x.id === id).map((x) => ({ kind, number, ...x })));
  return found[0] ?? null;
}

export async function search(viewer: Viewer, query: string): Promise<SearchHit[]> {
  const q = query.toLowerCase();
  return (await listOpportunities(viewer, today())).filter((o) => `${o.number} ${o.client} ${o.title}`.toLowerCase().includes(q))
    .map((o) => ({ type: "opportunity", id: o.number, title: `${o.client}, ${o.title}`, url: `/presales/o/${o.number}`, summary: `${o.stage}, ${o.winChance}%` })).slice(0, 20);
}
