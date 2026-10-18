export type RateChannel = "page" | "prefetch" | "rest" | "mcp" | "chat";
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

// One limiter per process. Next compiles the proxy and the app as separate bundles, each with its own
// copy of this module; where they share a process (k3s, standalone) the state on globalThis is one.
// Where the host runs the proxy apart (Vercel, Cloudflare), the proxy wires its own (review 058).
const KEY = Symbol.for("amax.rate-limit");
const shared = globalThis as unknown as { [KEY]?: State };
const state: State = (shared[KEY] ??= { limits: { page: PAGES, call: CALLS }, window: -1, counts: new Map(), sink: () => {}, now: Date.now });

type Options = { page?: Partial<Limits>; call?: Partial<Limits>; sink?: (l: Limited) => void; now?: () => number };

export function configureRateLimits(opts: Options) {
  state.limits = { page: { ...PAGES, ...opts.page }, call: { ...CALLS, ...opts.call } };
  if (opts.sink) state.sink = opts.sink;
  if (opts.now) state.now = opts.now;
  state.counts.clear();
  state.window = -1;
}

/** The limits in force, for screens that show them. */
export const rateLimits = () => ({ page: { ...state.limits.page }, call: { ...state.limits.call } });

/** Prefetches have a budget of their own, PREFETCH_SHARE times the page budget: the router speculates on
 * every visible link, so it would spend a person's navigations, but it can't run unmetered (060 AC-4). */
export const PREFETCH_SHARE = 10;
const prefetchLimits = (): Limits => {
  const p = state.limits.page;
  return { token: p.token * PREFETCH_SHARE, user: p.user * PREFETCH_SHARE, tenant: p.tenant * PREFETCH_SHARE, windowSeconds: p.windowSeconds };
};

function subjects(k: RateKey): [Bucket, string][] {
  const out: [Bucket, string][] = [["tenant", k.tenantId]];
  if (k.userId) out.push(["user", k.userId]);
  if (k.token) out.push(["token", k.token]);
  return out;
}

export function takeRate(k: RateKey): { ok: true } | { ok: false; retryAfter: number; bucket: Bucket } {
  const paged = k.channel === "page" || k.channel === "prefetch";
  const limits = k.channel === "prefetch" ? prefetchLimits() : paged ? state.limits.page : state.limits.call;
  const ms = limits.windowSeconds * 1000;
  const window = Math.floor(state.now() / ms);
  if (window !== state.window) {
    state.window = window;
    state.counts.clear();
  }
  const group = paged ? k.channel : "call";
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

/** Which page budget a request draws on (060 AC-4). Clients set these headers freely, so none skips
 * the limit: a server action is exempt only as a POST (it is counted per tool call in the registry),
 * and a prefetch is counted in a budget of its own instead of the person's navigations. */
export function pageChannel(method: string, h: Headers): "page" | "prefetch" | null {
  if (method === "POST" && h.get("next-action")) return null;
  if (h.get("next-router-prefetch") || h.get("purpose") === "prefetch" || h.get("sec-purpose")?.includes("prefetch")) return "prefetch";
  return "page";
}

export function enforceRate(k: RateKey) {
  const r = takeRate(k);
  if (!r.ok) throw new RateLimitedError(r.retryAfter, r.bucket);
}
