import { handleMcp } from "@amax/mcp/server";
import { baseUrl, getDb, toolRegistry } from "../../../lib/server";
import { CORS, preflight } from "../../../lib/oauth-http";

export const dynamic = "force-dynamic";

async function handle(req: Request) {
  const db = getDb();
  if (!db) return new Response("database not configured", { status: 503 });
  const res = await handleMcp(req, { db, registry: toolRegistry(), base: baseUrl(req) });
  for (const [k, v] of Object.entries(CORS)) res.headers.set(k, v);
  res.headers.set("access-control-expose-headers", "www-authenticate, mcp-session-id");
  return res;
}

export { handle as GET, handle as POST, handle as DELETE };
export const OPTIONS = preflight;
