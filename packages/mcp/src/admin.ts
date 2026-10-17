import { sql } from "drizzle-orm";
import { withTenant, type Db } from "@amax/db";
import { z } from "zod";
import { defineService } from "@amax/core/server";
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

// Revokes one person's grant to one client (a row on the Integrations screen): Admin only, audited
// with who did it and announced as auth.oauth.client_revoked (047 AC-3).
export const revokeMcpClient = defineService({
  name: "auth.oauth.client_revoked",
  action: "mcp:client:revoke",
  resource: "auth.api_token",
  input: z.object({ clientId: z.string().min(1), userId: z.string().min(1) }).strict(),
  async run(tx, { clientId, userId }) {
    const rows = await tx.execute(sql`update auth.api_token set revoked_at = now()
      where client_id = ${clientId} and user_id = ${userId} and kind = 'mcp' and revoked_at is null returning id`);
    if (!rows.length) throw Object.assign(new Error(`no active grant for client ${clientId} and that person`), { retryable: false });
    const after = { clientId, userId, tokens: rows.length };
    return { result: after, resourceId: clientId, after, events: [{ name: "auth.oauth.client_revoked", payload: after }] };
  },
});

/** One connected client grant, for the get_mcp_client read tool and pins. */
export async function getMcpClient(db: Db, tenantId: string, clientId: string, userId: string) {
  return (await connectedClients(db, tenantId)).find((c) => c.clientId === clientId && c.userId === userId) ?? null;
}
