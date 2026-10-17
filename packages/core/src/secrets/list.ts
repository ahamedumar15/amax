import { sql } from "drizzle-orm";
import { withTenant } from "@amax/db";
import { authorize, ForbiddenError, type ServiceContext } from "../authorize";
import { getRuntime } from "../service";
import { CONNECTORS, type ConnectorId } from "./connectors";
import { kmsLabel } from "./runtime";

export type CredentialRow = {
  connector: ConnectorId;
  status: "active" | "expired" | "revoked";
  lastRotatedAt: Date | null;
  expiresAt: Date | null;
  lastUsedAt: Date | null;
  lastUsedPurpose: string | null;
  revokedAt: Date | null;
  revokeReason: string | null;
};

const date = (v: unknown) => (v ? new Date(v as string) : null);
const order = Object.keys(CONNECTORS);

export async function listCredentials(ctx: ServiceContext): Promise<{ key: string | null; tenantName: string; rows: CredentialRow[] }> {
  if (!(await authorize(ctx, "secrets:credential:read", "secrets.credential", {}))) throw new ForbiddenError("secrets:credential:read", "secrets.credential");
  return withTenant(getRuntime().db, ctx.tenantId, async (tx) => {
    const [tenant] = await tx.execute(sql`select name from core.tenant where id = ${ctx.tenantId}`);
    const rows = await tx.execute(sql`select c.*, (select max(v.created_at) from secrets.version v where v.credential_id = c.id) as rotated_at from secrets.credential c`);
    const out = rows.filter((r) => (r.connector as string) in CONNECTORS).map((r): CredentialRow => {
      const expiresAt = date(r.expires_at);
      return {
        connector: r.connector as ConnectorId,
        status: r.revoked_at ? "revoked" : expiresAt && expiresAt <= new Date() ? "expired" : "active",
        lastRotatedAt: date(r.rotated_at), expiresAt, lastUsedAt: date(r.last_used_at), lastUsedPurpose: (r.last_used_purpose as string | null) ?? null,
        revokedAt: date(r.revoked_at), revokeReason: (r.revoke_reason as string | null) ?? null,
      };
    });
    out.sort((a, b) => Number(a.status === "revoked") - Number(b.status === "revoked") || order.indexOf(a.connector) - order.indexOf(b.connector));
    return { key: kmsLabel(), tenantName: (tenant?.name as string | undefined) ?? "", rows: out };
  });
}
