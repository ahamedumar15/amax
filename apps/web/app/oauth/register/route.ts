import { registerClient } from "@amax/mcp";
import { getDb } from "../../../lib/server";
import { json, oauthError, preflight } from "../../../lib/oauth-http";

export const dynamic = "force-dynamic";
export async function POST(req: Request) {
  try {
    return json(await registerClient(getDb()!, await req.json()), 201);
  } catch (e) {
    return oauthError(e);
  }
}
export const OPTIONS = preflight;
