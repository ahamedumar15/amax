import { exchangeToken } from "@amax/mcp";
import { getDb } from "../../../lib/server";
import { json, oauthError, preflight } from "../../../lib/oauth-http";

export const dynamic = "force-dynamic";
export async function POST(req: Request) {
  try {
    const type = req.headers.get("content-type") ?? "";
    const form = type.includes("application/json") ? new URLSearchParams(await req.json()) : new URLSearchParams(await req.text());
    return json(await exchangeToken(getDb()!, form));
  } catch (e) {
    return oauthError(e);
  }
}
export const OPTIONS = preflight;
