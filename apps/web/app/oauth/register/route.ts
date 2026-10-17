import { registerClient } from "@amax/mcp";
import { getDb } from "../../../lib/server";
import { json, oauthError, preflight, unavailable } from "../../../lib/oauth-http";

export const dynamic = "force-dynamic";
export async function POST(req: Request) {
  const db = getDb();
  if (!db) return unavailable();
  try {
    return json(await registerClient(db, await req.json()), 201);
  } catch (e) {
    return oauthError(e);
  }
}
export const OPTIONS = preflight;
