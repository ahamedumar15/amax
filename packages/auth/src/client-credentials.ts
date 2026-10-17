import { sql } from "drizzle-orm";
import { withTenant, type Db } from "@amax/db";
import { appendAudit } from "@amax/core/server";
import { authenticateToken } from "./principals";
import { newToken, tokenHash } from "./tokens";

export const CLIENT_TOKEN_SECONDS = 3600;

export class ClientCredentialsError extends Error {
  constructor(public code: "invalid_client" | "invalid_request") {
    super(code === "invalid_client" ? "the client id or secret is wrong, revoked or expired" : "client_id and client_secret are required");
    this.name = "ClientCredentialsError";
  }
}

export async function exchangeClientCredentials(db: Db, form: URLSearchParams) {
  const clientId = form.get("client_id");
  const secret = form.get("client_secret");
  if (!clientId || !secret) throw new ClientCredentialsError("invalid_request");
  const who = await authenticateToken(db, secret);
  if (who?.kind !== "principal" || who.principal.id !== clientId || !secret.startsWith("amx_sp_")) throw new ClientCredentialsError("invalid_client");
  const p = who.principal;
  const access = newToken("amx_spt");
  const seconds = Math.min(CLIENT_TOKEN_SECONDS, Math.floor((p.expiresAt.getTime() - Date.now()) / 1000));
  await withTenant(db, p.tenantId, async (tx) => {
    await tx.execute(sql`insert into auth.principal_token (tenant_id, principal_id, token_hash, expires_at)
      values (${p.tenantId}, ${p.id}, ${tokenHash(access)}, now() + make_interval(secs => ${seconds}))`);
    await appendAudit(tx, { tenantId: p.tenantId, actor: { id: `sp:${p.id}`, kind: "service" }, source: "api" },
      { action: "auth.principal.token_issued", resource: "auth.principal_token", resourceId: p.id, after: { grant: "client_credentials", seconds } });
  });
  return { access_token: access, token_type: "Bearer", expires_in: seconds, scope: p.scopes.join(" ") };
}
