import { revokeToken } from "@amax/mcp";
import { getDb } from "../../../lib/server";
import { preflight, CORS } from "../../../lib/oauth-http";

export const dynamic = "force-dynamic";
export async function POST(req: Request) {
  const form = new URLSearchParams(await req.text());
  await revokeToken(getDb()!, form.get("token") ?? "");
  return new Response(null, { status: 200, headers: CORS });
}
export const OPTIONS = preflight;
