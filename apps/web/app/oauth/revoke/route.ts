import { revokeToken } from "@amax/mcp";
import { getDb } from "../../../lib/server";
import { preflight, CORS } from "../../../lib/oauth-http";

export const dynamic = "force-dynamic";
export async function POST(req: Request) {
  const db = getDb();
  if (!db) return new Response(JSON.stringify({ error: "temporarily_unavailable", error_description: "database not configured" }), { status: 503, headers: { "content-type": "application/json" } });
  const form = new URLSearchParams(await req.text());
  await revokeToken(db, form.get("token") ?? "");
  return new Response(null, { status: 200, headers: CORS });
}
export const OPTIONS = preflight;
