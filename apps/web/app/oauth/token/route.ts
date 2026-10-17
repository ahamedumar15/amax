import { exchangeToken } from "@amax/mcp";
import { getDb } from "../../../lib/server";
import { json, oauthError, preflight, unavailable } from "../../../lib/oauth-http";

export const dynamic = "force-dynamic";
export async function POST(req: Request) {
  const db = getDb();
  if (!db) return unavailable();
  try {
    const type = req.headers.get("content-type") ?? "";
    const form = type.includes("application/json") ? new URLSearchParams(await req.json()) : new URLSearchParams(await req.text());
    return json(await exchangeToken(db, form));
  } catch (e) {
    return oauthError(e);
  }
}
export const OPTIONS = preflight;
