import { exchangeToken } from "@amax/mcp";
import { ClientCredentialsError, exchangeClientCredentials } from "@amax/auth/client-credentials";
import { getDb } from "../../../lib/server";
import { json, oauthError, preflight, unavailable } from "../../../lib/oauth-http";

export const dynamic = "force-dynamic";
export async function POST(req: Request) {
  const db = getDb();
  if (!db) return unavailable();
  try {
    const type = req.headers.get("content-type") ?? "";
    const form = type.includes("application/json") ? new URLSearchParams(await req.json()) : new URLSearchParams(await req.text());
    // 035 AC-2: service credentials trade their key for a short-lived access token.
    if (form.get("grant_type") === "client_credentials") return json(await exchangeClientCredentials(db, form));
    return json(await exchangeToken(db, form));
  } catch (e) {
    if (e instanceof ClientCredentialsError) return json({ error: e.code, error_description: e.message }, e.code === "invalid_client" ? 401 : 400);
    return oauthError(e);
  }
}
export const OPTIONS = preflight;
