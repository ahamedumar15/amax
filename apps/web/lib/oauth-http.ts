import { OAuthError } from "@amax/mcp";

// MCP clients may call these from browsers or desktop apps; tokens, not cookies, carry auth.
export const CORS = { "access-control-allow-origin": "*", "access-control-allow-methods": "GET, POST, DELETE, OPTIONS", "access-control-allow-headers": "authorization, content-type, mcp-protocol-version, mcp-session-id" };
export const json = (body: unknown, status = 200, extra: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "cache-control": "no-store", ...CORS, ...extra } });
export const oauthError = (e: unknown) =>
  e instanceof OAuthError ? json({ error: e.code, error_description: e.message }, e.code === "invalid_client" ? 401 : 400) : (console.error("oauth:", e), json({ error: "server_error" }, 500));
export const preflight = () => new Response(null, { status: 204, headers: CORS });
