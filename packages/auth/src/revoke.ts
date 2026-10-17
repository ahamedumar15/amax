import { sql } from "drizzle-orm";
import { withTenant, type Db, type Tx } from "@amax/db";
import { appendAudit } from "@amax/core/server";

// Ends every way a user can act: web sessions (the JWT re-check notices within a minute), API and
// MCP tokens (checked on every call), and optionally the account itself.
export async function revokeUserTx(tx: Tx, tenantId: string, userId: string, opts: { deactivate: boolean; reason: string }) {
  if (opts.deactivate) await tx.execute(sql`update auth.user set status = 'deactivated', updated_at = now() where id = ${userId}`);
  const sessions = await tx.execute(sql`update auth.session set revoked_at = now() where user_id = ${userId} and revoked_at is null returning id`);
  const tokens = await tx.execute(sql`update auth.api_token set revoked_at = now() where user_id = ${userId} and revoked_at is null returning id`);
  await appendAudit(tx, { tenantId, actor: { id: `system:${opts.reason}`, kind: "system" }, source: "job" }, {
    action: "auth.user.revoke", resource: "auth.user", resourceId: userId,
    after: { deactivated: opts.deactivate, sessions: sessions.length, tokens: tokens.length, reason: opts.reason },
  });
  return { sessions: sessions.length, tokens: tokens.length };
}

export const revokeUser = (db: Db, tenantId: string, userId: string, opts: { deactivate: boolean; reason: string }) =>
  withTenant(db, tenantId, (tx) => revokeUserTx(tx, tenantId, userId, opts));
