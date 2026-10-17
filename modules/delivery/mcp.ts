import { z } from "zod";
import type { McpToolDef, SearchHit } from "@amax/core";
import type { Viewer } from "@amax/auth";
import { PHASES } from "./contracts";
import { ctxFor } from "./server/context";
import { getProject, getRelease, listEnvironments, listProjects, listProposals, listReleases } from "./server/queries";
import { createProject, createProposal, createRelease, moveProposal, recordDeployment, removeEnvironment, setReleaseProposals, tagRelease, upsertEnvironment, voidDeployment } from "./server/services";

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
  tool({ ...read, name: "list_environments", description: "A project's environments in order, which one is Prod, and how many deployments each has.", input: z.object({ projectKey: z.string() }),
    run: (v, a) => listEnvironments(v, a.projectKey) }),
  tool({ ...read, name: "get_release_history", description: "A release's proposals and full deployment history, including voided records.", input: z.object({ projectKey: z.string(), version: z.string() }),
    run: (v, a) => getRelease(v, a.projectKey, a.version) }),
  tool({ name: "upsert_environment", description: "Add, rename, reorder or mark an environment as Prod for a project (marking one Prod unmarks the rest).", scope: "write", permission: "delivery:release:create",
    input: z.object({ projectKey: z.string(), name: z.string(), rename: z.string().optional(), position: z.number().int().min(1).optional(), isProd: z.boolean().optional() }),
    run: (v, a, s = "mcp") => upsertEnvironment(ctxFor(v, s), a) }),
  tool({ name: "remove_environment", description: "Remove an unused environment from a project.", scope: "write", destructive: true, permission: "delivery:release:create",
    input: z.object({ projectKey: z.string(), name: z.string() }), run: (v, a, s = "mcp") => removeEnvironment(ctxFor(v, s), a) }),
  tool({ name: "tag_release", description: "Rename a release's version tag, e.g. v2.5.0 to v2.5.1.", scope: "write", permission: "delivery:release:create",
    input: z.object({ projectKey: z.string(), version: z.string(), newVersion: z.string() }), run: (v, a, s = "mcp") => tagRelease(ctxFor(v, s), a) }),
  tool({ name: "set_release_proposals", description: "Set which proposals are in a release (replaces the list; released ones stay).", scope: "write", permission: "delivery:release:create",
    input: z.object({ projectKey: z.string(), version: z.string(), proposalKeys: z.array(z.string()) }), run: (v, a, s = "mcp") => setReleaseProposals(ctxFor(v, s), a) }),
  tool({ name: "void_deployment", description: "Void the latest deployment of a release to an environment, with a reason. Voiding the only Prod deployment un-releases its proposals.", scope: "write", destructive: true,
    permission: "delivery:deployment:record", input: z.object({ projectKey: z.string(), version: z.string(), environment: z.string(), reason: z.string() }),
    run: (v, a, s = "mcp") => voidDeployment(ctxFor(v, s), a) }),
  tool({ name: "record_deployment", description: "Record that a release reached any environment of its project (by name, as a pipeline reports it). The project's Prod environment releases its proposals. PM or Admin.", scope: "write", destructive: false,
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
