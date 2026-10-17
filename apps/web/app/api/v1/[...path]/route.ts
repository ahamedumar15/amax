import { handleRest } from "@amax/api";
import { baseUrl, getDb, toolRegistry } from "../../../../lib/server";

export const dynamic = "force-dynamic";

async function handle(req: Request) {
  const db = getDb();
  if (!db) return new Response("database not configured", { status: 503 });
  return handleRest(req, { db, registry: toolRegistry(), base: baseUrl(req) });
}

export { handle as GET, handle as POST };
