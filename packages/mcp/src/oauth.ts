import { createHash, randomBytes } from "node:crypto";
import { sql } from "drizzle-orm";
import { withTenant, type Db } from "@amax/db";
import { tokenHash } from "@amax/auth/tokens";
import { viewerForUser, type Viewer } from "@amax/auth";
import { ALL_SCOPES, type Scope } from "./registry";

// amax is the OAuth 2.1 authorization server for its own MCP resource (004 AC-1): dynamic client
// registration, authorization code + PKCE (S256), short-lived audience-bound access tokens and
// rotating refresh tokens. Tokens are opaque and stored hashed.
export const ACCESS_SECONDS = 3600;
export const REFRESH_DAYS = 30;
const CODE_SECONDS = 600;

export class OAuthError extends Error {
  constructor(public code: "invalid_request" | "invalid_client" | "invalid_grant" | "invalid_scope" | "unsupported_grant_type" | "access_denied", message: string) {
    super(message);
    this.name = "OAuthError";
  }
}

export const mcpResource = (base: string) => `${base.replace(/\/$/, "")}/api/mcp`;

export const metadata = {
  protectedResource: (base: string) => ({
    resource: mcpResource(base),
    authorization_servers: [base.replace(/\/$/, "")],
    scopes_supported: ALL_SCOPES,
    bearer_methods_supported: ["header"],
    resource_name: "amax",
  }),
  authorizationServer: (base: string) => {
    const b = base.replace(/\/$/, "");
    return {
      issuer: b,
      authorization_endpoint: `${b}/oauth/authorize`,
      token_endpoint: `${b}/oauth/token`,
      registration_endpoint: `${b}/oauth/register`,
      revocation_endpoint: `${b}/oauth/revoke`,
      response_types_supported: ["code"],
      grant_types_supported: ["authorization_code", "refresh_token"],
      code_challenge_methods_supported: ["S256"],
      token_endpoint_auth_methods_supported: ["none"],
      scopes_supported: ALL_SCOPES,
    };
  },
};

export const parseScopes = (s: string | null | undefined): Scope[] => {
  const asked = (s ?? "read").split(/\s+/).filter(Boolean);
  const bad = asked.filter((x) => !(ALL_SCOPES as string[]).includes(x));
  if (bad.length) throw new OAuthError("invalid_scope", `unknown scope ${bad.join(", ")}`);
  return asked as Scope[];
};

const okRedirect = (uri: string) => {
  try {
    const u = new URL(uri);
    return u.protocol === "https:" || (u.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(u.hostname)) || /^[a-z][a-z0-9+.-]*:$/.test(u.protocol) && !["http:", "javascript:", "data:", "file:"].includes(u.protocol);
  } catch {
    return false;
  }
};

export async function registerClient(db: Db, body: { client_name?: string; redirect_uris?: string[] }) {
  const uris = body.redirect_uris ?? [];
  if (!uris.length || !uris.every(okRedirect)) throw new OAuthError("invalid_request", "redirect_uris must be https, a loopback http address or an app scheme");
  const id = `mcp_${randomBytes(12).toString("base64url")}`;
  const name = (body.client_name ?? "MCP client").slice(0, 100);
  await db.execute(sql`insert into auth.oauth_client (id, name, redirect_uris) values (${id}, ${name}, ${`{${uris.map((u) => `"${u.replace(/"/g, "")}"`).join(",")}}`}::text[])`);
  return { client_id: id, client_name: name, redirect_uris: uris, token_endpoint_auth_method: "none", grant_types: ["authorization_code", "refresh_token"], response_types: ["code"] };
}

export async function getClient(db: Db, id: string) {
  const [c] = await db.execute(sql`select * from auth.oauth_client where id = ${id}`);
  return c ? { id: c.id as string, name: c.name as string, redirectUris: c.redirect_uris as string[] } : null;
}

export type AuthorizeRequest = { clientId: string; redirectUri: string; scopes: Scope[]; codeChallenge: string; resource: string; state?: string };

export async function validateAuthorize(db: Db, base: string, p: URLSearchParams): Promise<AuthorizeRequest & { clientName: string }> {
  const client = await getClient(db, p.get("client_id") ?? "");
  if (!client) throw new OAuthError("invalid_client", "unknown client");
  const redirectUri = p.get("redirect_uri") ?? "";
  if (!client.redirectUris.includes(redirectUri)) throw new OAuthError("invalid_request", "redirect_uri isn't registered for this client");
  if (p.get("response_type") !== "code") throw new OAuthError("invalid_request", "response_type must be code");
  if (p.get("code_challenge_method") !== "S256" || !p.get("code_challenge")) throw new OAuthError("invalid_request", "PKCE with S256 is required");
  const resource = p.get("resource") ?? mcpResource(base);
  if (resource !== mcpResource(base)) throw new OAuthError("invalid_request", "tokens are only issued for this server's MCP resource");
  return { clientId: client.id, clientName: client.name, redirectUri, scopes: parseScopes(p.get("scope")), codeChallenge: p.get("code_challenge")!, resource, state: p.get("state") ?? undefined };
}

/** After the signed-in user approves the consent screen. */
export async function issueCode(db: Db, viewer: Viewer, req: AuthorizeRequest) {
  const code = randomBytes(32).toString("base64url");
  await withTenant(db, viewer.tenantId, (tx) => tx.execute(sql`insert into auth.oauth_code (code_hash, tenant_id, user_id, client_id, redirect_uri, scopes, resource, code_challenge, expires_at)
    values (${tokenHash(code)}, ${viewer.tenantId}, ${viewer.userId}, ${req.clientId}, ${req.redirectUri}, ${`{${req.scopes.join(",")}}`}::text[], ${req.resource}, ${req.codeChallenge},
            now() + make_interval(secs => ${CODE_SECONDS}))`));
  const u = new URL(req.redirectUri);
  u.searchParams.set("code", code);
  if (req.state) u.searchParams.set("state", req.state);
  return u.toString();
}

const s256 = (verifier: string) => createHash("sha256").update(verifier).digest("base64url");

async function mint(tx: Parameters<Parameters<typeof withTenant>[2]>[0], row: { tenantId: string; userId: string; clientId: string; scopes: string[]; audience: string }) {
  const access = `amx_mcp_${randomBytes(24).toString("base64url")}`;
  const refresh = `amx_rt_${randomBytes(32).toString("base64url")}`;
  await tx.execute(sql`insert into auth.api_token (tenant_id, user_id, kind, name, token_hash, expires_at, scopes, client_id, audience, refresh_hash, refresh_expires_at)
    values (${row.tenantId}, ${row.userId}, 'mcp', ${`OAuth: ${row.clientId}`}, ${tokenHash(access)}, now() + make_interval(secs => ${ACCESS_SECONDS}),
            ${`{${row.scopes.join(",")}}`}::text[], ${row.clientId}, ${row.audience}, ${tokenHash(refresh)}, now() + make_interval(days => ${REFRESH_DAYS}))`);
  return { access_token: access, token_type: "Bearer", expires_in: ACCESS_SECONDS, refresh_token: refresh, scope: row.scopes.join(" ") };
}

/** POST /oauth/token (form body). */
export async function exchangeToken(db: Db, form: URLSearchParams) {
  const grant = form.get("grant_type");
  if (grant === "authorization_code") {
    const code = form.get("code") ?? "";
    const [hit] = await db.execute(sql`select auth.lookup_oauth_code(${tokenHash(code)}) as tenant_id`);
    if (!hit?.tenant_id) throw new OAuthError("invalid_grant", "unknown or expired code");
    return withTenant(db, hit.tenant_id as string, async (tx) => {
      const [c] = await tx.execute(sql`update auth.oauth_code set used_at = now() where code_hash = ${tokenHash(code)} and used_at is null and expires_at > now() returning *`);
      if (!c) throw new OAuthError("invalid_grant", "code already used or expired");
      if (c.client_id !== form.get("client_id") || c.redirect_uri !== form.get("redirect_uri")) throw new OAuthError("invalid_grant", "client or redirect_uri doesn't match the code");
      if (s256(form.get("code_verifier") ?? "") !== c.code_challenge) throw new OAuthError("invalid_grant", "PKCE verification failed");
      return mint(tx, { tenantId: c.tenant_id as string, userId: c.user_id as string, clientId: c.client_id as string, scopes: c.scopes as string[], audience: c.resource as string });
    });
  }
  if (grant === "refresh_token") {
    const refresh = form.get("refresh_token") ?? "";
    const [hit] = await db.execute(sql`select * from auth.lookup_refresh(${tokenHash(refresh)})`);
    if (!hit) throw new OAuthError("invalid_grant", "unknown refresh token");
    return withTenant(db, hit.tenant_id as string, async (tx) => {
      // Rotation: the old pair dies; reuse of a rotated refresh token fails.
      const [old] = await tx.execute(sql`update auth.api_token set revoked_at = now(), refresh_hash = null where id = ${hit.id} and revoked_at is null and refresh_expires_at > now() returning *`);
      if (!old) throw new OAuthError("invalid_grant", "refresh token revoked or expired");
      const [u] = await tx.execute(sql`select status from auth.user where id = ${old.user_id}`);
      if (u?.status !== "active") throw new OAuthError("invalid_grant", "user is deactivated");
      return mint(tx, { tenantId: old.tenant_id as string, userId: old.user_id as string, clientId: old.client_id as string, scopes: old.scopes as string[], audience: old.audience as string });
    });
  }
  throw new OAuthError("unsupported_grant_type", "use authorization_code or refresh_token");
}

export async function revokeToken(db: Db, token: string) {
  for (const fn of [sql`select tenant_id, id from auth.lookup_token(${tokenHash(token)}) where kind = 'mcp'`, sql`select * from auth.lookup_refresh(${tokenHash(token)})`]) {
    const [hit] = await db.execute(fn);
    if (hit) await withTenant(db, hit.tenant_id as string, (tx) => tx.execute(sql`update auth.api_token set revoked_at = now(), refresh_hash = null where id = ${hit.id}`));
  }
}

/** Bearer check for /api/mcp: an MCP access token for this audience, live, and its user active. */
export async function authenticateMcp(db: Db, token: string, audience: string): Promise<{ viewer: Viewer; scopes: Scope[]; clientId: string | null } | null> {
  const [hit] = await db.execute(sql`select * from auth.lookup_token(${tokenHash(token)})`);
  if (!hit || hit.kind !== "mcp") return null;
  return withTenant(db, hit.tenant_id as string, async (tx) => {
    const [t] = await tx.execute(sql`select * from auth.api_token where id = ${hit.id} and revoked_at is null and expires_at > now()`);
    if (!t || (t.audience && t.audience !== audience)) return null;
    const viewer = await viewerForUser(tx, hit.tenant_id as string, t.user_id as string);
    return viewer ? { viewer, scopes: t.scopes as Scope[], clientId: (t.client_id as string | null) ?? null } : null;
  });
}
