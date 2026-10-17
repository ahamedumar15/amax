import { sql } from "drizzle-orm";
import { type Db, textArray, uuidArray, withTenant } from "@amax/db";
import { appendAudit, ForbiddenError, type ServiceContext } from "@amax/core/server";
import { can } from "./can";
import { viewerForUser } from "./session";
import { newToken, tokenHash } from "./tokens";
import type { Viewer } from "./viewer";

// Service principals are identities for CI, specclaw and integrations: an owner, scopes, an expiry
// and the people they may act for. Personal API and MCP tokens act as their user.
export type Principal = { id: string; tenantId: string; name: string; ownerUserId: string; scopes: string[]; actsFor: string[]; expiresAt: Date };
export type Identity = { kind: "user"; viewer: Viewer; tokenKind: "api" | "mcp" } | { kind: "principal"; principal: Principal };

const MAX_DAYS = 365;
const scopeAllows = (scopes: string[], action: string) => scopes.some((s) => s === action || (s.endsWith(":*") && action.startsWith(s.slice(0, -1))));

// 035: per-module tool scopes ("delivery:write"). Write includes read; sensitive is its own grant.
export const principalAllowsTool = (p: Pick<Principal, "scopes">, module: string, scope: "read" | "write" | "sensitive") =>
  p.scopes.includes(`${module}:${scope}`) || (scope === "read" && p.scopes.includes(`${module}:write`));

export async function createPrincipal(db: Db, owner: Viewer, p: { name: string; scopes: string[]; actsFor: string[]; days: number }) {
  if (!owner.actualRoles.includes("Admin")) throw new ForbiddenError("auth:principal:create", "auth.service_principal");
  if (p.days < 1 || p.days > MAX_DAYS) throw new Error(`expiry must be 1–${MAX_DAYS} days`);
  if (!p.scopes.length) throw new Error("a principal needs at least one scope");
  const token = newToken("amx_sp");
  const id = await withTenant(db, owner.tenantId, async (tx) => {
    const [row] = await tx.execute(sql`insert into auth.service_principal (tenant_id, name, owner_user_id, scopes, acts_for, token_hash, expires_at)
      values (${owner.tenantId}, ${p.name}, ${owner.userId}, ${textArray(p.scopes)}, ${uuidArray(p.actsFor)}, ${tokenHash(token)},
              now() + make_interval(days => ${p.days})) returning id`);
    await appendAudit(tx, { tenantId: owner.tenantId, actor: { id: `user:${owner.userId}`, kind: "user" }, source: "ui" },
      { action: "auth.principal.create", resource: "auth.service_principal", resourceId: row.id as string, after: { name: p.name, scopes: p.scopes, actsFor: p.actsFor, days: p.days } });
    return row.id as string;
  });
  return { id, token };
}

export async function createApiToken(db: Db, user: Viewer, t: { kind: "api" | "mcp"; name: string; days: number }) {
  if (t.days < 1 || t.days > MAX_DAYS) throw new Error(`expiry must be 1–${MAX_DAYS} days`);
  const token = newToken(t.kind === "mcp" ? "amx_mcp" : "amx_api");
  await withTenant(db, user.tenantId, (tx) => tx.execute(sql`insert into auth.api_token (tenant_id, user_id, kind, name, token_hash, expires_at)
    values (${user.tenantId}, ${user.userId}, ${t.kind}, ${t.name}, ${tokenHash(token)}, now() + make_interval(days => ${t.days}))`));
  return token;
}

// Every API/MCP call authenticates here, so a revoked, expired or deactivated identity stops
// working on its next call.
export async function authenticateToken(db: Db, token: string): Promise<Identity | null> {
  const [hit] = await db.execute(sql`select * from auth.lookup_token(${tokenHash(token)})`);
  if (!hit) return null;
  const tenantId = hit.tenant_id as string;
  return withTenant(db, tenantId, async (tx) => {
    if (hit.kind === "principal") {
      const [p] = await tx.execute(sql`select * from auth.service_principal where id = ${hit.id} and revoked_at is null and expires_at > now()`);
      if (!p) return null;
      return { kind: "principal", principal: { id: p.id as string, tenantId, name: p.name as string, ownerUserId: p.owner_user_id as string, scopes: p.scopes as string[], actsFor: p.acts_for as string[], expiresAt: new Date(p.expires_at as string) } };
    }
    const [t] = await tx.execute(sql`select user_id, kind from auth.api_token where id = ${hit.id} and revoked_at is null and expires_at > now()`);
    if (!t) return null;
    const viewer = await viewerForUser(tx, tenantId, t.user_id as string);
    return viewer ? { kind: "user", viewer, tokenKind: t.kind as "api" | "mcp" } : null;
  });
}

// The context a principal's call runs with. Refused (and audited) when the action is outside its
// scopes, it is expired, or it acts for someone not on its list; acting for a person is further
// limited to what that person may do.
export async function principalContext(db: Db, p: Principal, action: string, onBehalfOf?: string): Promise<ServiceContext> {
  const refuse = async (reason: string) => {
    await withTenant(db, p.tenantId, (tx) => appendAudit(tx, { tenantId: p.tenantId, actor: { id: `sp:${p.id}`, kind: "service" }, onBehalfOf, source: "api" },
      { action: "auth.principal.refused", resource: action, resourceId: p.id, after: { reason, principal: p.name } }));
    throw new ForbiddenError(action, `service principal ${p.name}: ${reason}`);
  };
  if (p.expiresAt <= new Date()) await refuse("expired");
  if (!scopeAllows(p.scopes, action)) await refuse("outside scopes");
  let person: Viewer | null = null;
  if (onBehalfOf) {
    if (!p.actsFor.includes(onBehalfOf)) await refuse("not allowed to act for this person");
    person = await withTenant(db, p.tenantId, (tx) => viewerForUser(tx, p.tenantId, onBehalfOf));
    if (!person) await refuse("person is not active");
    if (!can(person!, action)) await refuse("the person may not do this");
  }
  return { tenantId: p.tenantId, actor: { id: `sp:${p.id}`, kind: "service" }, onBehalfOf, source: "api", viewer: person ?? undefined, principal: p } as ServiceContext;
}
