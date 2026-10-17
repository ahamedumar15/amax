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

type State = { limits: { page: Limits; call: Limits }; window: number; counts: Map<string, number>; sink: (l: Limited) => void; now: () => number; configured: boolean };

// One limiter per process (review 058 B6). Next compiles the proxy and the app as separate bundles,
// each with its own copy of this module; keeping the state on globalThis makes them share the limits
// the app configures, the counts and the sink that records 429s, instead of the proxy using defaults.
const KEY = Symbol.for("amax.rate-limit");
const shared = globalThis as unknown as { [KEY]?: State };
const state: State = (shared[KEY] ??= { limits: { page: PAGES, call: CALLS }, window: -1, counts: new Map(), sink: () => {}, now: Date.now, configured: false });

type Options = { page?: Partial<Limits>; call?: Partial<Limits>; sink?: (l: Limited) => void; now?: () => number };

export function configureRateLimits(opts: Options) {
  state.limits = { page: { ...PAGES, ...opts.page }, call: { ...CALLS, ...opts.call } };
  if (opts.sink) state.sink = opts.sink;
  if (opts.now) state.now = opts.now;
  state.counts.clear();
  state.window = -1;
  state.configured = true;
}

/** For an entry point that may run before the app wires the limiter (the proxy): configures the
 * limits from the environment unless the app already has, and never resets counts or the sink. */
export function ensureRateLimits(opts: Pick<Options, "page" | "call">) {
  if (state.configured) return;
  state.limits = { page: { ...PAGES, ...opts.page }, call: { ...CALLS, ...opts.call } };
  state.configured = true;
}

/** The limits in force, for screens that show them. */
export const rateLimits = () => ({ page: { ...state.limits.page }, call: { ...state.limits.call } });

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

type RateEnv = Partial<Record<"AMAX_RATE_PAGE_USER" | "AMAX_RATE_PAGE_TENANT" | "AMAX_RATE_CALL_TOKEN" | "AMAX_RATE_CALL_USER" | "AMAX_RATE_CALL_TENANT", number>>;

export const limitsFromEnv = (e: RateEnv) => ({
  page: { ...(e.AMAX_RATE_PAGE_USER && { user: e.AMAX_RATE_PAGE_USER, token: e.AMAX_RATE_PAGE_USER }), ...(e.AMAX_RATE_PAGE_TENANT && { tenant: e.AMAX_RATE_PAGE_TENANT }) },
  call: { ...(e.AMAX_RATE_CALL_TOKEN && { token: e.AMAX_RATE_CALL_TOKEN }), ...(e.AMAX_RATE_CALL_USER && { user: e.AMAX_RATE_CALL_USER }), ...(e.AMAX_RATE_CALL_TENANT && { tenant: e.AMAX_RATE_CALL_TENANT }) },
});

export function countsAsPage(h: Headers) {
  if (h.get("next-router-prefetch") || h.get("purpose") === "prefetch" || h.get("sec-purpose")?.includes("prefetch")) return false;
  return !h.get("next-action");
}

export function enforceRate(k: RateKey) {
  const r = takeRate(k);
  if (!r.ok) throw new RateLimitedError(r.retryAfter, r.bucket);
}
