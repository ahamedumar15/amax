import { logError } from "@amax/core/server";
import { OAuthError } from "@amax/mcp";

// MCP clients may call these from browsers or desktop apps; tokens, not cookies, carry auth.
export const CORS = { "access-control-allow-origin": "*", "access-control-allow-methods": "GET, POST, DELETE, OPTIONS", "access-control-allow-headers": "authorization, content-type, mcp-protocol-version, mcp-session-id" };
export const json = (body: unknown, status = 200, extra: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "cache-control": "no-store", ...CORS, ...extra } });
export const oauthError = (e: unknown) =>
  e instanceof OAuthError ? json({ error: e.code, error_description: e.message }, e.code === "invalid_client" ? 401 : 400) : json({ error: "server_error", error_description: `request ${logError("oauth", e)}` }, 500);
/** No database configured: a CORS-carrying 503, so browser clients see the real reason. */
export const unavailable = () => json({ error: "temporarily_unavailable", error_description: "database not configured" }, 503);
export const preflight = () => new Response(null, { status: 204, headers: CORS });
