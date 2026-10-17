export type RateChannel = "page" | "rest" | "mcp" | "chat";
export type RateKey = { tenantId: string; channel: RateChannel; userId?: string | null; token?: string | null };
export type Bucket = "token" | "user" | "tenant";
export type Limits = Record<Bucket, number> & { windowSeconds: number };
export type Limited = { tenantId: string; channel: RateChannel; bucket: Bucket; subject: string };

const PAGES: Limits = { token: 600, user: 600, tenant: 10_000, windowSeconds: 60 };
const CALLS: Limits = { token: 120, user: 240, tenant: 2_000, windowSeconds: 60 };

export class RateLimitedError extends Error {
  readonly retryable = true;
  readonly code = "rate_limited";
  constructor(public retryAfter: number, public bucket: Bucket) {
    super(`rate limited: too many requests for this ${bucket}; retry after ${retryAfter}s`);
    this.name = "RateLimitedError";
  }
}

type State = { limits: { page: Limits; call: Limits }; window: number; counts: Map<string, number>; sink: (l: Limited) => void; now: () => number };
const state: State = { limits: { page: PAGES, call: CALLS }, window: -1, counts: new Map(), sink: () => {}, now: Date.now };

export function configureRateLimits(opts: { page?: Partial<Limits>; call?: Partial<Limits>; sink?: (l: Limited) => void; now?: () => number }) {
  state.limits = { page: { ...PAGES, ...opts.page }, call: { ...CALLS, ...opts.call } };
  if (opts.sink) state.sink = opts.sink;
  if (opts.now) state.now = opts.now;
  state.counts.clear();
  state.window = -1;
}

function subjects(k: RateKey): [Bucket, string][] {
  const out: [Bucket, string][] = [["tenant", k.tenantId]];
  if (k.userId) out.push(["user", k.userId]);
  if (k.token) out.push(["token", k.token]);
  return out;
}

export function takeRate(k: RateKey): { ok: true } | { ok: false; retryAfter: number; bucket: Bucket } {
  const limits = k.channel === "page" ? state.limits.page : state.limits.call;
  const ms = limits.windowSeconds * 1000;
  const window = Math.floor(state.now() / ms);
  if (window !== state.window) {
    state.window = window;
    state.counts.clear();
  }
  const group = k.channel === "page" ? "page" : "call";
  const keys = subjects(k).map(([b, id]) => [b, id, `${group}:${k.tenantId}:${b}:${id}`] as const);
  const over = keys.find(([b, , key]) => (state.counts.get(key) ?? 0) >= limits[b]);
  if (over) {
    state.sink({ tenantId: k.tenantId, channel: k.channel, bucket: over[0], subject: `${over[0]}:${over[1]}` });
    return { ok: false, retryAfter: Math.max(1, Math.ceil(((window + 1) * ms - state.now()) / 1000)), bucket: over[0] };
  }
  for (const [, , key] of keys) state.counts.set(key, (state.counts.get(key) ?? 0) + 1);
  return { ok: true };
}

export function enforceRate(k: RateKey) {
  const r = takeRate(k);
  if (!r.ok) throw new RateLimitedError(r.retryAfter, r.bucket);
}
