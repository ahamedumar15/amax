import { z } from "zod";
import type { McpToolDef, SearchHit } from "@amax/core";
import type { Viewer } from "@amax/auth";
import { PHASES } from "./contracts";
import { pinOf } from "./pins";
import { ctxFor } from "./server/context";
import { getActivity, listActivity } from "./server/activity";
import { markTaskDone, TaskInput } from "./server/tasks";
import { syncProposal } from "./server/services";
import { checkReleaseRef, getDeployment, getEnvironment, getProject, getProposal, getRelease, isRelease, listEnvironments, listProjects, listProposals, listReleases } from "./server/queries";
import { createProject, createProposal, createRelease, moveProposal, recordDeployment, removeEnvironment, setReleaseProposals, tagRelease, upsertEnvironment, voidDeployment } from "./server/services";

// MCP tools (004): the same queries and services as the screens, so permissions and audit match.
// Chat (005) runs read tools directly and turns write tools into a confirm card first.
type Src = "mcp" | "chat";
const tool = <I extends z.ZodType>(t: Omit<McpToolDef, "input" | "run"> & { input: I; run: (v: Viewer, input: z.infer<I>, source: Src) => Promise<unknown> }) => t as unknown as McpToolDef;
const read = { scope: "read" as const, readOnly: true, permission: "delivery:read" };
// One input for every read that names a release: its id, or its project key and version (057).
const releaseRef = z.object({ releaseId: z.string().uuid().optional(), projectKey: z.string().optional(), version: z.string().optional() });
// 059: a pin names one record by its id; a list or a project's environments is a view.
const view = "view" as const;

export const mcpTools: McpToolDef[] = [
  tool({ ...read, pin: view, name: "list_projects", description: "Active projects with health, sprint progress and next release.", input: z.object({}), run: (v) => listProjects(v) }),
  // 008 AC-4: the Overview's Agent activity feed, and one line of it for its pin.
  tool({ ...read, pin: view, name: "list_activity", description: "What agents, pipelines and people did lately through ingestion, newest first, with who acted for whom.",
    input: z.object({ limit: z.number().int().min(1).max(50).optional() }), run: (v, a) => listActivity(v, a.limit) }),
  tool({ ...read, pin: { id: "id", of: (r: { id: string; pin: { label: string } } | null) => (r ? { id: r.id, label: r.pin.label } : null) }, name: "get_activity", description: "One line of the agent activity feed by id.",
    input: z.object({ id: z.string().uuid() }), run: (v, a) => getActivity(v, a.id) }),
  tool({ ...read, pin: { id: "projectId", of: pinOf.project }, name: "get_project", description: "One project and its proposals, by projectId or by project key such as CON or AMX.",
    input: z.object({ projectId: z.string().uuid().optional(), key: z.string().optional() }), run: (v, a) => getProject(v, a.key, a.projectId) }),
  tool({ ...read, pin: view, name: "list_proposals", description: "specclaw proposals, optionally filtered by phase or project key.", input: z.object({ phase: z.enum(PHASES).optional(), projectKey: z.string().optional() }),
    run: (v, a) => listProposals(v, a) }),
  tool({ ...read, pin: { id: "proposalId", of: pinOf.proposal }, name: "get_proposal", description: "One proposal by proposalId, or by key such as CON-12 (a key given with an id only narrows): phase, owner, tasks, hours and release.",
    input: z.object({ proposalId: z.string().uuid().optional(), key: z.string().optional() }), run: (v, a) => getProposal(v, a) }),
  tool({ ...read, pin: view, name: "list_releases", description: "Every release with its project, proposal count and the stage it reached in each environment, optionally for one project key.",
    input: z.object({ projectKey: z.string().optional() }), run: (v, a) => listReleases(v, a) }),
  tool({ ...read, pin: { id: "releaseId", of: pinOf.release }, name: "get_release", description: "A release and where it is in Dev, QA, UAT and Prod: by releaseId, or by project key and version.",
    // The ref is checked before the read, so a malformed call is refused whatever the viewer can see.
    input: releaseRef, run: async (v, a) => { checkReleaseRef(a); return (await listReleases(v)).find((r) => isRelease(r, a)) ?? null; } }),
  tool({ name: "create_project", description: "Create a project. Key: 2-10 capitals, e.g. CON.", scope: "write", permission: "delivery:project:create",
    input: z.object({ key: z.string(), name: z.string(), client: z.string(), billing: z.enum(["fixed", "t&m", "retainer", "internal"]) }),
    service: createProject, run: (v, a, s = "mcp") => createProject(ctxFor(v, s), a) }),
  tool({ name: "create_proposal", description: "Add a proposal to a project's board (it starts as Proposed).", scope: "write", permission: "delivery:proposal:create",
    input: z.object({ projectKey: z.string(), title: z.string(), estimateHours: z.number().nonnegative().optional() }),
    service: createProposal, run: (v, a, s = "mcp") => createProposal(ctxFor(v, s), a) }),
  tool({ name: "move_proposal", description: "Move a proposal on the board (proposed, planned, building, verified). Released only comes from a Prod deployment.", scope: "write",
    permission: "delivery:proposal:move", input: z.object({ key: z.string(), to: z.enum(["proposed", "planned", "building", "verified"]) }),
    service: moveProposal, run: (v, a, s = "mcp") => moveProposal(ctxFor(v, s), a) }),
  tool({ name: "create_release", description: "Create a release (version tag) for a project, optionally with proposal keys.", scope: "write", permission: "delivery:release:create",
    input: z.object({ projectKey: z.string(), version: z.string(), proposalKeys: z.array(z.string()).optional() }),
    service: createRelease, run: (v, a, s = "mcp") => createRelease(ctxFor(v, s), { ...a, proposalKeys: a.proposalKeys ?? [] }) }),
  tool({ ...read, pin: view, name: "list_environments", description: "A project's environments in order, which one is Prod, and how many deployments each has.", input: z.object({ projectKey: z.string() }),
    run: (v, a) => listEnvironments(v, a.projectKey) }),
  tool({ ...read, pin: { id: "environmentId", of: pinOf.environment }, name: "get_environment", description: "One environment, by environmentId or by project key and name: its position, whether it is Prod, and how many deployments it has.",
    input: z.object({ environmentId: z.string().uuid().optional(), projectKey: z.string().optional(), name: z.string().optional() }), run: (v, a) => getEnvironment(v, a) }),
  tool({ ...read, pin: { id: "deploymentId", of: pinOf.deployment }, name: "get_deployment", description: "One deployment by id (a row of a release's deployment history), including a voided one. A project key or version only narrows.",
    input: z.object({ deploymentId: z.string().uuid(), projectKey: z.string().optional(), version: z.string().optional() }), run: (v, a) => getDeployment(v, a.deploymentId, a) }),
  tool({ ...read, pin: { id: "releaseId", of: pinOf.history }, name: "get_release_history", description: "A release's proposals and full deployment history, including voided records: by releaseId, or by project key and version.",
    input: releaseRef, run: (v, a) => getRelease(v, a.projectKey, a.version, a.releaseId) }),
  tool({ name: "upsert_environment", description: "Add, rename, reorder or mark an environment as Prod for a project (marking one Prod unmarks the rest).", scope: "write", permission: "delivery:release:create",
    input: z.object({ projectKey: z.string(), name: z.string(), rename: z.string().optional(), position: z.number().int().min(1).optional(), isProd: z.boolean().optional() }),
    service: upsertEnvironment, run: (v, a, s = "mcp") => upsertEnvironment(ctxFor(v, s), a) }),
  tool({ name: "remove_environment", description: "Remove an unused environment from a project.", scope: "write", destructive: true, permission: "delivery:release:create",
    input: z.object({ projectKey: z.string(), name: z.string() }), service: removeEnvironment, run: (v, a, s = "mcp") => removeEnvironment(ctxFor(v, s), a) }),
  tool({ name: "tag_release", description: "Rename a release's version tag, e.g. v2.5.0 to v2.5.1.", scope: "write", permission: "delivery:release:create",
    input: z.object({ projectKey: z.string(), version: z.string(), newVersion: z.string() }), service: tagRelease, run: (v, a, s = "mcp") => tagRelease(ctxFor(v, s), a) }),
  tool({ name: "set_release_proposals", description: "Set which proposals are in a release (replaces the list; released ones stay).", scope: "write", permission: "delivery:release:create",
    input: z.object({ projectKey: z.string(), version: z.string(), proposalKeys: z.array(z.string()) }), service: setReleaseProposals, run: (v, a, s = "mcp") => setReleaseProposals(ctxFor(v, s), a) }),
  tool({ name: "void_deployment", description: "Void a deployment of a release, with a reason: the one given by deploymentId, or else the latest live one to the environment. Voiding the only Prod deployment un-releases its proposals.", scope: "write", destructive: true,
    permission: "delivery:deployment:record", input: z.object({ projectKey: z.string(), version: z.string(), environment: z.string(), deploymentId: z.string().uuid().optional(), reason: z.string() }),
    service: voidDeployment, run: (v, a, s = "mcp") => voidDeployment(ctxFor(v, s), a) }),
  // 008 AC-1: what specclaw and CI call, as a person or as a service credential acting for one.
  tool({ name: "sync_proposal", description: "Create or update a specclaw proposal from its spec: title, phase, and tasks by id (T1, T2, …). A task once done stays done.", scope: "write", permission: "delivery:proposal:sync",
    input: z.object({ projectKey: z.string(), projectName: z.string(), client: z.string(), key: z.string(), title: z.string(), phase: z.enum(PHASES), sourceRef: z.string(), tasks: z.array(TaskInput), meta: z.record(z.string(), z.unknown()).optional() }),
    service: syncProposal, run: (v, a, s = "mcp") => syncProposal(ctxFor(v, s), { projectKey: a.projectKey, project: { name: a.projectName, client: a.client }, key: a.key, title: a.title, phase: a.phase,
      tasksDone: a.tasks.filter((t) => t.done).length, tasksTotal: a.tasks.length, source: "specclaw", sourceRef: a.sourceRef, releasedAt: null, meta: a.meta ?? {}, tasks: a.tasks }) }),
  tool({ name: "mark_task_done", description: "Mark one task of a proposal done by its id, e.g. CON-014 T3, optionally naming the commit that finished it.", scope: "write", permission: "delivery:task:done",
    input: z.object({ key: z.string(), task: z.string(), commit: z.string().optional() }), service: markTaskDone, run: (v, a, s = "mcp") => markTaskDone(ctxFor(v, s), a) }),
  tool({ name: "record_deployment", description: "Record that a release reached any environment of its project (by name, as a pipeline reports it). The project's Prod environment releases its proposals. PM or Admin.", scope: "write", destructive: false,
    permission: "delivery:deployment:record",
    input: z.object({ projectKey: z.string(), version: z.string(), environment: z.string(), status: z.enum(["deployed", "testing", "rolled-back"]).optional(), note: z.string().optional() }),
    service: recordDeployment, run: (v, a, s = "mcp") => recordDeployment(ctxFor(v, s), a) }),
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
