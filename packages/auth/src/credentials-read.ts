import { sql } from "drizzle-orm";
import { withTenant, type Db } from "@amax/db";

export type CredentialView = {
  id: string;
  name: string;
  owner: string;
  scopes: string[];
  /** 008: the only tools it may call, or null for every tool its scopes allow. */
  tools: string[] | null;
  actsFor: string[];
  expiresAt: string;
  revokedAt: string | null;
  lastUsedAt: string | null;
  status: "active" | "expired" | "revoked";
};

const iso = (v: unknown) => (v ? new Date(v as string).toISOString() : null);

function statusOf(revokedAt: string | null, expiresAt: string, now: number): CredentialView["status"] {
  if (revokedAt) return "revoked";
  return Date.parse(expiresAt) <= now ? "expired" : "active";
}

export async function listCredentialViews(db: Db, tenantId: string, now = Date.now()): Promise<CredentialView[]> {
  const rows = await withTenant(db, tenantId, (tx) => tx.execute(sql`
    select p.id, p.name, o.name as owner, p.scopes, p.tools, p.expires_at, p.revoked_at,
      coalesce((select array_agg(u.name order by u.name) from auth.user u where u.id = any(p.acts_for)), '{}') as acts_for,
      (select max(t.occurred_at) from core.trace_event t where t.actor = 'sp:' || p.id::text) as last_used_at
    from auth.service_principal p join auth.user o on o.id = p.owner_user_id
    order by p.revoked_at nulls first, p.created_at`));
  return rows.map((r) => {
    const expiresAt = iso(r.expires_at)!;
    const revokedAt = iso(r.revoked_at);
    return {
      id: r.id as string, name: r.name as string, owner: r.owner as string, scopes: r.scopes as string[], tools: (r.tools as string[] | null) ?? null, actsFor: r.acts_for as string[],
      expiresAt, revokedAt, lastUsedAt: iso(r.last_used_at), status: statusOf(revokedAt, expiresAt, now),
    };
  });
}
