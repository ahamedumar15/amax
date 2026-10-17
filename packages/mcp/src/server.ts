import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import type { Db } from "@amax/db";
import { RateLimitedError, traceStep, withTrace } from "@amax/core/server";
import { bearer, tokenHash } from "@amax/auth/tokens";
import { authenticateMcp, mcpResource } from "./oauth";
import type { Registry } from "./registry";

// 050: each MCP tool call is one trace; a client acts for the token's user.
const traceOf = (auth: { viewer: { tenantId: string; userId: string }; clientId: string | null }) => ({
  tenantId: auth.viewer.tenantId,
  actor: auth.clientId ? `client:${auth.clientId}` : `user:${auth.viewer.userId}`,
  onBehalfOf: auth.clientId ? `user:${auth.viewer.userId}` : null,
  source: "mcp" as const,
});

// POST/GET/DELETE /api/mcp: Streamable HTTP, stateless per request. The tool list is built for the
// caller's roles and token scopes; every call runs through the registry (and so module services).
export async function handleMcp(req: Request, deps: { db: Db; registry: Registry; base: string }): Promise<Response> {
  const unauthorized = () => new Response(JSON.stringify({ error: "invalid_token" }), {
    status: 401,
    headers: { "content-type": "application/json", "www-authenticate": `Bearer resource_metadata="${deps.base.replace(/\/$/, "")}/.well-known/oauth-protected-resource"` },
  });
  const token = bearer(req);
  if (!token) return unauthorized();
  const auth = await authenticateMcp(deps.db, token, mcpResource(deps.base));
  if (!auth) return unauthorized();

  // 035 AC-5: the registry enforces the per-token, user and tenant limits; a limited call answers 429.
  const tokenKey = tokenHash(token).slice(0, 16);
  const limited: { e: RateLimitedError | null } = { e: null };
  const server = new McpServer({ name: "amax", version: "0.1.0" });
  for (const tool of deps.registry.toolsFor(auth.viewer, auth.scopes)) {
    server.registerTool(tool.name, {
      description: tool.description,
      inputSchema: tool.input as never,
      annotations: { readOnlyHint: tool.scope !== "write", destructiveHint: tool.destructive ?? false },
    }, (async (args: unknown) => {
      try {
        const result = await withTrace(traceOf(auth), async () => {
          await traceStep({ kind: "mcp_call", tool: tool.name, args: args ?? {}, detail: { client: auth.clientId } });
          return deps.registry.call(auth.viewer, tool.name, args, { scopes: auth.scopes, source: "mcp", token: tokenKey });
        });
        return { content: [{ type: "text", text: JSON.stringify(result) }] };
      } catch (e) {
        if (e instanceof RateLimitedError) limited.e = e;
        return { isError: true, content: [{ type: "text", text: e instanceof Error ? e.message : String(e) }] };
      }
    }) as never);
  }
  const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
  await server.connect(transport);
  const res = await transport.handleRequest(req);
  return limited.e ? tooMany(limited.e) : res;
}

export const tooMany = (e: RateLimitedError) =>
  new Response(JSON.stringify({ error: "rate_limited", message: e.message }), { status: 429, headers: { "content-type": "application/json", "retry-after": String(e.retryAfter) } });
