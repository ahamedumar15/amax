import { withTenant, type Db } from "@amax/db";
import { appendAudit, type Trace } from "@amax/core/server";
import { authenticateToken, principalAllowsTool, viewerForUser, type Principal, type Viewer } from "@amax/auth";
import { tokenHash } from "@amax/auth/tokens";
import type { RegisteredTool } from "@amax/mcp";

export type Caller = { viewer: Viewer; token: string; trace: Omit<Trace, "traceId">; principal: Principal | null };
export class CallerError extends Error {
  constructor(public status: 401 | 403, message: string) {
    super(message);
    this.name = "CallerError";
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function refuse(db: Db, p: Principal, tool: string, reason: string, onBehalfOf?: string): Promise<never> {
  await withTenant(db, p.tenantId, (tx) => appendAudit(tx, { tenantId: p.tenantId, actor: { id: `sp:${p.id}`, kind: "service" }, onBehalfOf, source: "api" },
    { action: "auth.principal.refused", resource: tool, resourceId: p.id, after: { reason, principal: p.name } }));
  throw new CallerError(403, `service credential ${p.name}: ${reason}`);
}

async function asPrincipal(db: Db, p: Principal, tool: RegisteredTool, actFor: string | null): Promise<Viewer> {
  if (!principalAllowsTool(p, tool.module, tool.scope)) return refuse(db, p, tool.name, `outside its scopes (needs ${tool.module}:${tool.scope})`);
  if (!actFor || !UUID.test(actFor)) return refuse(db, p, tool.name, "name the person it acts for in the amax-act-for header");
  if (!p.actsFor.includes(actFor)) return refuse(db, p, tool.name, "not allowed to act for this person", actFor);
  const person = await withTenant(db, p.tenantId, (tx) => viewerForUser(tx, p.tenantId, actFor));
  return person ?? refuse(db, p, tool.name, "the person is not active", actFor);
}

export async function resolveCaller(db: Db, token: string | null, tool: RegisteredTool, actFor: string | null): Promise<Caller> {
  if (!token) throw new CallerError(401, "a bearer token is required");
  const who = await authenticateToken(db, token);
  if (!who) throw new CallerError(401, "the token is invalid, revoked or expired");
  const key = tokenHash(token).slice(0, 16);
  if (who.kind === "user") {
    if (who.tokenKind !== "api") throw new CallerError(401, "MCP tokens work only at /api/mcp; use an API token");
    return { viewer: who.viewer, token: key, principal: null, trace: { tenantId: who.viewer.tenantId, actor: `user:${who.viewer.userId}`, source: "api" } };
  }
  const p = who.principal;
  const viewer = await asPrincipal(db, p, tool, actFor);
  return { viewer, token: key, principal: p, trace: { tenantId: p.tenantId, actor: `sp:${p.id}`, onBehalfOf: `user:${viewer.userId}`, source: "api" } };
}
