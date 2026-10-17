import { z } from "zod";
import type { Viewer } from "@amax/auth";
import { ctxFor } from "./server/context";
import { getProject, listProjects, listProposals, listReleases } from "./server/queries";
import { recordDeployment } from "./server/services";
import { PHASES } from "./contracts";

// MCP tools, registered by the 004 gateway when it's installed. Each calls the same queries and
// services as the screens, so permissions and audit are identical.
export type McpTool = { name: string; description: string; input: z.ZodType; permission: string; run: (viewer: Viewer, args: never) => Promise<unknown> };

export const mcpTools: McpTool[] = [
  { name: "list_projects", description: "Active projects with health, sprint progress and next release.", input: z.object({}), permission: "delivery:read",
    run: (v) => listProjects(v) },
  { name: "get_project", description: "One project and its proposals by key, e.g. CON.", input: z.object({ key: z.string() }), permission: "delivery:read",
    run: (v, a: { key: string }) => getProject(v, a.key) },
  { name: "list_proposals", description: "specclaw proposals, optionally by phase or project.", input: z.object({ phase: z.enum(PHASES).optional(), projectKey: z.string().optional() }),
    permission: "delivery:read", run: (v, a: { phase?: (typeof PHASES)[number]; projectKey?: string }) => listProposals(v, a) },
  { name: "get_release", description: "A release and where it is in Dev, QA, UAT and Prod.", input: z.object({ projectKey: z.string(), version: z.string() }), permission: "delivery:read",
    run: async (v, a: { projectKey: string; version: string }) => (await listReleases(v)).find((r) => r.projectKey === a.projectKey && r.version === a.version) ?? null },
  { name: "record_deployment", description: "Record that a release reached an environment. Prod releases its proposals. PM or Admin.",
    input: z.object({ projectKey: z.string(), version: z.string(), environment: z.string(), status: z.enum(["deployed", "testing", "rolled-back"]).optional(), note: z.string().optional() }),
    permission: "delivery:deployment:record", run: (v, a: Record<string, unknown>) => recordDeployment(ctxFor(v, "mcp"), a) },
];
