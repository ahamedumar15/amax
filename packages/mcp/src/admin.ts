import { sql } from "drizzle-orm";
import { withTenant, type Db } from "@amax/db";
import { appendAudit } from "@amax/core/server";
import { canEver, ROLES, type Role, type Viewer } from "@amax/auth";
import type { Registry } from "./registry";

// Integrations screen data (004 AC-4): tools by module with who can use them, and connected clients.
export function toolCatalogue(registry: Registry, tenantId: string) {
  const asRole = (role: Role): Viewer => ({ tenantId, userId: "", name: "", email: "", assignments: [{ role, legalEntityIds: null, departments: null }], actualRoles: [role], managedProjects: [], assignedProjects: [], reports: [] });
  return registry.all.map((t) => ({
    module: t.module, name: t.name, description: t.description, scope: t.scope, readOnly: t.scope !== "write", destructive: t.destructive ?? false,
    roles: t.permission ? ROLES.filter((r) => canEver(asRole(r), t.permission)) : [...ROLES],
  }));
}

export async function connectedClients(db: Db, tenantId: string) {
  return withTenant(db, tenantId, async (tx) => (await tx.execute(sql`
    select c.id as client_id, c.name as client_name, u.id as user_id, u.name as user_name, t.scopes, max(t.created_at) as last_auth, count(*)::int as tokens
    from auth.api_token t join auth.oauth_client c on c.id = t.client_id join auth.user u on u.id = t.user_id
    where t.kind = 'mcp' and t.revoked_at is null and (t.expires_at > now() or t.refresh_expires_at > now())
    group by c.id, c.name, u.id, u.name, t.scopes order by last_auth desc`)).map((r) => ({
    clientId: r.client_id as string, clientName: r.client_name as string, userId: r.user_id as string, userName: r.user_name as string, scopes: r.scopes as string[], lastAuth: new Date(r.last_auth as string).toISOString(),
  })));
}

// Revokes one person's grant to one client (a row on the Integrations screen), audited as the Admin.
export async function revokeClient(db: Db, admin: { tenantId: string; userId: string }, clientId: string, userId: string) {
  await withTenant(db, admin.tenantId, async (tx) => {
    const rows = await tx.execute(sql`update auth.api_token set revoked_at = now()
      where client_id = ${clientId} and user_id = ${userId} and revoked_at is null returning id`);
    await appendAudit(tx, { tenantId: admin.tenantId, actor: { id: `user:${admin.userId}`, kind: "user" }, source: "ui" },
      { action: "auth.oauth.client_revoked", resource: "auth.api_token", resourceId: clientId, after: { clientId, userId, tokens: rows.length } });
  });
}
