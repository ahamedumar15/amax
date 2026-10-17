import { timingSafeEqual } from "node:crypto";
import { logError, type TickResult } from "@amax/core/server";

export type TickDeps = { secret: string | undefined; run: (() => Promise<TickResult>) | null };

const same = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

// Shared by Vercel Cron (GET, Bearer CRON_SECRET), the Cloudflare Cron Trigger and the k3s worker.
export async function handleTick(req: Request, deps: TickDeps): Promise<Response> {
  if (!deps.secret) return Response.json({ error: "CRON_SECRET is not configured" }, { status: 503 });
  const auth = req.headers.get("authorization") ?? "";
  if (!same(auth, `Bearer ${deps.secret}`)) return Response.json({ error: "unauthorized" }, { status: 401 });
  if (!deps.run) return Response.json({ error: "database not configured" }, { status: 503 });
  try {
    return Response.json({ ok: true, ...(await deps.run()) });
  } catch (e) {
    logError("tick", e);
    return Response.json({ error: "tick failed" }, { status: 500 });
  }
}

// Cloudflare scheduled() → an authenticated request to our own tick route.
export const tickRequest = (secret: string, origin = "https://amax.internal") =>
  new Request(`${origin}/api/jobs/tick`, { method: "POST", headers: { authorization: `Bearer ${secret}` } });
