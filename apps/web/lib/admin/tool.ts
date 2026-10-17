import type { z } from "zod";
import type { McpToolDef } from "@amax/core";
import type { ServiceContext, Source } from "@amax/core/server";
import type { Viewer } from "@amax/auth";
import type { Db } from "@amax/db";
import type { Registry } from "@amax/mcp";
import type { WorkflowEngine, WorkflowRegistry } from "@amax/workflows/server";

/** What the admin tools need from the running app; tests pass their own. */
export type AdminDeps = { db: () => Db; workflows: () => WorkflowRegistry; engine: () => Promise<WorkflowEngine>; tools: () => Registry };

type Src = "mcp" | "chat" | "api";
export const tool = <I extends z.ZodType>(t: Omit<McpToolDef, "input" | "run"> & { input: I; run: (v: Viewer, input: z.infer<I>, source: Src, secret?: string) => Promise<unknown> }) => t as unknown as McpToolDef;

// The tool acts for the signed-in person; the audit records the person and the channel (chat or MCP).
export const ctxFor = (viewer: Viewer, source: Source): ServiceContext => ({
  tenantId: viewer.tenantId,
  actor: { id: `user:${viewer.userId}`, kind: "user", roles: viewer.actualRoles },
  source,
  viewer,
});

export const read = (permission: string) => ({ scope: "read" as const, readOnly: true, permission });
export const write = (permission: string) => ({ scope: "write" as const, permission });

export const notFound = (what: string) => Object.assign(new Error(`${what} not found`), { retryable: false, code: "not_found" });
