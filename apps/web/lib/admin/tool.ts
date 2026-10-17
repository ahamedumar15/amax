import type { z } from "zod";
import type { McpToolDef } from "@amax/core";
import type { ServiceContext, Source } from "@amax/core/server";
import { contextForViewer, type Viewer } from "@amax/auth";
import type { Db } from "@amax/db";
import type { Registry } from "@amax/mcp";
import type { WorkflowEngine, WorkflowRegistry } from "@amax/workflows/server";

/** What the admin tools need from the running app; tests pass their own. */
export type AdminDeps = { db: () => Db; workflows: () => WorkflowRegistry; engine: () => Promise<WorkflowEngine>; tools: () => Registry };

type Src = "mcp" | "chat" | "api";
export const tool = <I extends z.ZodType>(t: Omit<McpToolDef, "input" | "run" | "propose"> & { input: I; run: (v: Viewer, input: z.infer<I>, source: Src, secret?: string) => Promise<unknown>; propose?: (v: Viewer, input: z.infer<I>) => Promise<void> }) => t as unknown as McpToolDef;

// The tool acts for the viewer; the audit records the person, or the service credential acting for
// them, and the channel (058: one shared builder, contextForViewer).
export const ctxFor = (viewer: Viewer, source: Source): ServiceContext => contextForViewer(viewer, source);

export const read = (permission: string) => ({ scope: "read" as const, readOnly: true, permission });
export const write = (permission: string) => ({ scope: "write" as const, permission });

export const notFound = (what: string) => Object.assign(new Error(`${what} not found`), { retryable: false, code: "not_found" });
