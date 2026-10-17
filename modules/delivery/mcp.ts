import { z } from "zod";
import type { McpToolDef, SearchHit } from "@amax/core";
import type { Viewer } from "@amax/auth";
import { PHASES } from "./contracts";
import { ctxFor } from "./server/context";
import { getProject, listProjects, listProposals, listReleases } from "./server/queries";
import { createProject, createProposal, createRelease, moveProposal, recordDeployment } from "./server/services";

// MCP tools (004): the same queries and services as the screens, so permissions and audit match.
// Chat (005) runs read tools directly and turns write tools into a confirm card first.
type Src = "mcp" | "chat";
const tool = <I extends z.ZodType>(t: Omit<McpToolDef, "input" | "run"> & { input: I; run: (v: Viewer, input: z.infer<I>, source: Src) => Promise<unknown> }) => t as unknown as McpToolDef;
const read = { scope: "read" as const, readOnly: true, permission: "delivery:read" };

export const mcpTools: McpToolDef[] = [
  tool({ ...read, name: "list_projects", description: "Active projects with health, sprint progress and next release.", input: z.object({}), run: (v) => listProjects(v) }),
  tool({ ...read, name: "get_project", description: "One project and its proposals, by project key such as CON or AMX.", input: z.object({ key: z.string() }), run: (v, a) => getProject(v, a.key) }),
  tool({ ...read, name: "list_proposals", description: "specclaw proposals, optionally filtered by phase or project key.", input: z.object({ phase: z.enum(PHASES).optional(), projectKey: z.string().optional() }),
    run: (v, a) => listProposals(v, a) }),
  tool({ ...read, name: "get_release", description: "A release and where it is in Dev, QA, UAT and Prod.", input: z.object({ projectKey: z.string(), version: z.string() }),
    run: async (v, a) => (await listReleases(v)).find((r) => r.projectKey === a.projectKey && r.version === a.version) ?? null }),
  tool({ name: "create_project", description: "Create a project. Key: 2-10 capitals, e.g. CON.", scope: "write", permission: "delivery:project:create",
    input: z.object({ key: z.string(), name: z.string(), client: z.string(), billing: z.enum(["fixed", "t&m", "retainer", "internal"]) }),
    run: (v, a, s = "mcp") => createProject(ctxFor(v, s), a) }),
  tool({ name: "create_proposal", description: "Add a proposal to a project's board (it starts as Proposed).", scope: "write", permission: "delivery:proposal:create",
    input: z.object({ projectKey: z.string(), title: z.string(), estimateHours: z.number().nonnegative().optional() }),
    run: (v, a, s = "mcp") => createProposal(ctxFor(v, s), a) }),
  tool({ name: "move_proposal", description: "Move a proposal on the board (proposed, planned, building, verified). Released only comes from a Prod deployment.", scope: "write",
    permission: "delivery:proposal:move", input: z.object({ key: z.string(), to: z.enum(["proposed", "planned", "building", "verified"]) }),
    run: (v, a, s = "mcp") => moveProposal(ctxFor(v, s), a) }),
  tool({ name: "create_release", description: "Create a release (version tag) for a project, optionally with proposal keys.", scope: "write", permission: "delivery:release:create",
    input: z.object({ projectKey: z.string(), version: z.string(), proposalKeys: z.array(z.string()).optional() }),
    run: (v, a, s = "mcp") => createRelease(ctxFor(v, s), { ...a, proposalKeys: a.proposalKeys ?? [] }) }),
  tool({ name: "record_deployment", description: "Record that a release reached an environment. Prod releases its proposals. PM or Admin.", scope: "write", destructive: false,
    permission: "delivery:deployment:record",
    input: z.object({ projectKey: z.string(), version: z.string(), environment: z.string(), status: z.enum(["deployed", "testing", "rolled-back"]).optional(), note: z.string().optional() }),
    run: (v, a, s = "mcp") => recordDeployment(ctxFor(v, s), a) }),
];

// Contribution to the built-in search tool.
export async function search(viewer: Viewer, query: string): Promise<SearchHit[]> {
  const q = query.toLowerCase();
  const [projects, proposals] = await Promise.all([listProjects(viewer), listProposals(viewer)]);
  return [
    ...projects.filter((p) => `${p.key} ${p.name} ${p.client}`.toLowerCase().includes(q)).map((p) => ({ type: "project", id: p.key, title: p.name, url: `/delivery/p/${p.key}`, summary: `${p.client}, ${p.health}` })),
    ...proposals.filter((p) => `${p.key} ${p.title}`.toLowerCase().includes(q)).map((p) => ({ type: "proposal", id: p.key, title: `${p.key} ${p.title}`, url: `/delivery/p/${p.projectKey}`, summary: `${p.phase} in ${p.projectName}` })),
  ].slice(0, 20);
}
