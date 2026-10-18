import { PROVIDERS, receiveWebhook } from "@amax/api";
import { logError } from "@amax/core/server";
import { installed } from "../../../../../lib/registry";
import { getDb } from "../../../../../lib/server";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const REFUSED: Record<string, number> = { missing: 401, signature: 401, stale: 401, malformed: 400, not_configured: 404 };

// 008 AC-2: a provider's webhook for one tenant. 035 verifies it (signature, replay window, dedupe)
// before any module sees it; a duplicate is acknowledged and dropped. A module that fails is logged
// and the provider is still told it arrived, so it doesn't redeliver a verified event.
export async function POST(req: Request, { params }: { params: Promise<{ tenant: string; provider: string }> }) {
  const { tenant, provider } = await params;
  if (!getDb()) return new Response("database not configured", { status: 503 });
  if (!UUID.test(tenant) || !(PROVIDERS as readonly string[]).includes(provider)) return new Response("not found", { status: 404 });
  const body = await req.text();
  const v = await receiveWebhook(tenant, provider as (typeof PROVIDERS)[number], req.headers, body);
  if (!v.ok) return v.reason === "duplicate" ? new Response(null, { status: 200 }) : new Response(v.reason, { status: REFUSED[v.reason] ?? 400 });
  const payload = JSON.parse(body) as unknown;
  for (const m of installed.filter((x) => x.inbound?.providers.includes(provider))) {
    await m.inbound!.handle({ tenantId: tenant, provider, eventId: v.eventId, headers: req.headers, payload }).catch((e: unknown) => logError(`webhook ${provider} → ${m.id}`, e));
  }
  return new Response(null, { status: 202 });
}
