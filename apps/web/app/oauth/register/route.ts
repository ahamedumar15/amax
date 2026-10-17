import { registerClient } from "@amax/mcp";
import { getDb } from "../../../lib/server";
import { json, oauthError, preflight } from "../../../lib/oauth-http";

export const dynamic = "force-dynamic";
export async function POST(req: Request) {
  const db = getDb();
  if (!db) return new Response(JSON.stringify({ error: "temporarily_unavailable", error_description: "database not configured" }), { status: 503, headers: { "content-type": "application/json" } });
  try {
    return json(await registerClient(db, await req.json()), 201);
  } catch (e) {
    return oauthError(e);
  }
}
export const OPTIONS = preflight;
