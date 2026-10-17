import { revokeToken } from "@amax/mcp";
import { getDb } from "../../../lib/server";
import { preflight, CORS, unavailable } from "../../../lib/oauth-http";

export const dynamic = "force-dynamic";
export async function POST(req: Request) {
  const db = getDb();
  if (!db) return unavailable();
  const form = new URLSearchParams(await req.text());
  await revokeToken(db, form.get("token") ?? "");
  return new Response(null, { status: 200, headers: CORS });
}
export const OPTIONS = preflight;
