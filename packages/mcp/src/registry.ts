import { z } from "zod";
import type { McpToolDef, ModuleManifest, SearchHit } from "@amax/core";
import { ForbiddenError, traceStep } from "@amax/core/server";
import { canEver, rolesOf, ScopeError, type Viewer } from "@amax/auth";
import { auditTools } from "./audit-tools";

export type Scope = McpToolDef["scope"];
export const ALL_SCOPES: Scope[] = ["read", "write", "sensitive"];
export type RegisteredTool = McpToolDef & { module: string };

export class ToolError extends Error {
  readonly retryable = false;
  constructor(message: string, public code: "not_found" | "forbidden" | "invalid_input") {
    super(message);
    this.name = "ToolError";
  }
}

type Registrable = Pick<ModuleManifest, "id" | "mcpTools" | "search">;

// Built in: who am I, and search across every module that contributes results (AC-3).
function builtins(modules: Registrable[]): RegisteredTool[] {
  return [
    {
      module: "core", name: "whoami", description: "The signed-in user, tenant and roles.", input: z.object({}).strict(), permission: "", scope: "read", readOnly: true,
      run: async (viewer: Viewer) => ({ userId: viewer.userId, name: viewer.name, email: viewer.email, tenantId: viewer.tenantId, roles: rolesOf(viewer), viewAs: viewer.viewAs ?? null }),
    } as unknown as RegisteredTool,
    {
      module: "core", name: "search", description: "Search projects, proposals and other records by text.", input: z.object({ query: z.string().min(1), limit: z.number().int().min(1).max(50).optional() }).strict(),
      permission: "", scope: "read", readOnly: true,
      run: async (viewer: Viewer, input: { query: string; limit?: number }) => {
        // A module the viewer may not read contributes nothing; any other failure is reported, not
        // dressed up as "no matches" (review round 1). One shape every time (review round 2).
        const notSearched: string[] = [];
        const results = await Promise.all(modules.filter((m) => m.search).map((m) => m.search!(viewer as never, input.query).catch((e: unknown) => {
          if (!(e instanceof ForbiddenError || e instanceof ScopeError)) notSearched.push(m.id);
          return [] as SearchHit[];
        })));
        return { hits: results.flat().slice(0, input.limit ?? 20), notSearched };
      },
    } as unknown as RegisteredTool,
    ...auditTools(),
  ];
}

export function createRegistry(modules: Registrable[]) {
  const tools: RegisteredTool[] = [...builtins(modules), ...modules.flatMap((m) => (m.mcpTools ?? []).map((t) => ({ ...t, module: m.id })))];
  const seen = new Set<string>();
  for (const t of tools) {
    if (seen.has(t.name)) throw new Error(`MCP tool "${t.name}" is declared twice`);
    seen.add(t.name);
  }
  const allowed = (viewer: Viewer, t: RegisteredTool, scopes: Scope[]) => scopes.includes(t.scope) && (!t.permission || canEver(viewer, t.permission));

  return {
    all: tools,
    /** Only tools this viewer's roles and this token's scopes allow (AC-3). */
    toolsFor: (viewer: Viewer, scopes: Scope[] = ALL_SCOPES) => tools.filter((t) => allowed(viewer, t, scopes)),
    /** Re-checks access, validates input and runs the tool; module services do the record-level checks and audit. */
    async call(viewer: Viewer, name: string, args: unknown, opts: { scopes?: Scope[]; source: "mcp" | "chat"; secret?: string }) {
      const tool = tools.find((t) => t.name === name);
      if (!tool) throw new ToolError(`no tool named ${name}`, "not_found");
      // 050: inside a trace (chat turn, confirm, MCP call) every tool call is a step, refusals included.
      const step = (outcome: string) => traceStep({ kind: "tool_call", tool: name, args: args ?? {}, detail: { scope: tool.scope, outcome } });
      if (!allowed(viewer, tool, opts.scopes ?? ALL_SCOPES)) {
        await step("denied");
        throw new ToolError(`forbidden: ${name}`, "forbidden");
      }
      const parsed = tool.input.safeParse(args ?? {});
      if (!parsed.success) throw new ToolError(`invalid input for ${name}: ${parsed.error.issues.map((i) => `${i.path.join(".") || "(root)"} ${i.message}`).join("; ")}`, "invalid_input");
      try {
        const result = await tool.run(viewer as never, parsed.data as never, opts.source, tool.secretInput ? opts.secret : undefined);
        await step("ok");
        return result;
      } catch (e) {
        await step(e instanceof ForbiddenError || e instanceof ScopeError ? "denied" : "error");
        throw e;
      }
    },
  };
}

export type Registry = ReturnType<typeof createRegistry>;
