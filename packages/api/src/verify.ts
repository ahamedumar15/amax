import { createHash, createHmac, timingSafeEqual } from "node:crypto";

export const PROVIDERS = ["github", "azure-devops", "msgraph", "amax"] as const;
export type Provider = (typeof PROVIDERS)[number];
export const REPLAY_WINDOW_MS = 5 * 60_000;

export type Inbound = { provider: Provider; headers: Headers; body: string; secrets: string[]; now?: number };
/** `not_configured`: this tenant has no secret for the provider, so nothing could be verified. A setup
 * problem, not an attacker (review 058 B3). */
export type Verdict = { ok: true; eventId: string } | { ok: false; reason: "missing" | "signature" | "stale" | "malformed" | "not_configured"; eventId: string | null };

const same = (a: string, b: string) => {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
};
const hmac = (secret: string, data: string) => createHmac("sha256", secret).update(data).digest("hex");
export const signPayload = (secret: string, t: number, body: string) => `t=${t},v1=${hmac(secret, `${t}.${body}`)}`;

function json(body: string): Record<string, unknown> | null {
  try {
    const v = JSON.parse(body);
    return v && typeof v === "object" ? (v as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

// Dedupe on what the signature covers (review 058 B6): a delivery id header is not signed, so a
// replay with a fresh id would otherwise pass as a new event.
const signedId = (body: string) => createHash("sha256").update(body).digest("hex").slice(0, 32);

const fresh = (at: number, now: number) => Number.isFinite(at) && Math.abs(now - at) <= REPLAY_WINDOW_MS;

function github(i: Inbound): Verdict {
  const id = i.headers.get("x-github-delivery");
  const sig = i.headers.get("x-hub-signature-256");
  if (!sig || !id) return { ok: false, reason: "missing", eventId: id };
  return i.secrets.some((s) => same(sig, `sha256=${hmac(s, i.body)}`)) ? { ok: true, eventId: signedId(i.body) } : { ok: false, reason: "signature", eventId: id };
}

function azureDevOps(i: Inbound, now: number): Verdict {
  const auth = i.headers.get("authorization")?.match(/^Basic\s+(\S+)$/i)?.[1];
  const body = json(i.body);
  const id = typeof body?.id === "string" ? body.id : null;
  if (!auth || !id) return { ok: false, reason: "missing", eventId: id };
  const password = Buffer.from(auth, "base64").toString("utf8").split(":").slice(1).join(":");
  if (!i.secrets.some((s) => same(password, s))) return { ok: false, reason: "signature", eventId: id };
  return fresh(Date.parse(String(body?.createdDate)), now) ? { ok: true, eventId: id } : { ok: false, reason: "stale", eventId: id };
}

function msgraph(i: Inbound): Verdict {
  const items = json(i.body)?.value;
  if (!Array.isArray(items) || !items.length) return { ok: false, reason: "malformed", eventId: null };
  const id = signedId(i.body);
  const states = items.map((v) => String((v as { clientState?: unknown }).clientState ?? ""));
  return states.every((c) => i.secrets.some((s) => same(c, s))) ? { ok: true, eventId: id } : { ok: false, reason: "signature", eventId: id };
}

function amax(i: Inbound, now: number): Verdict {
  const id = i.headers.get("x-amax-delivery");
  const sig = i.headers.get("x-amax-signature");
  const t = Number(sig?.match(/^t=(\d+),/)?.[1]);
  if (!sig || !id || !t) return { ok: false, reason: "missing", eventId: id };
  if (!i.secrets.some((s) => same(sig, signPayload(s, t, i.body)))) return { ok: false, reason: "signature", eventId: id };
  return fresh(t * 1000, now) ? { ok: true, eventId: signedId(i.body) } : { ok: false, reason: "stale", eventId: id };
}

export function verifyWebhook(i: Inbound): Verdict {
  const now = i.now ?? Date.now();
  if (!i.secrets.length) return { ok: false, reason: "not_configured", eventId: null };
  return { github, "azure-devops": azureDevOps, msgraph, amax }[i.provider](i, now);
}
