import { loadEnv } from "@amax/core/env";

const LOOPBACK = /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/;

// 004: the public base URL (for OAuth metadata, the MCP audience and, since 062, the marketing page's canonical URL and sitemap).
// The public origin is configuration, never request headers: it becomes the OAuth issuer and the
// MCP token audience (review round 1, B6). Outside production a loopback host may stand in.
export const baseUrl = (req: Request | Headers) => {
  const env = loadEnv();
  if (env.AMAX_BASE_URL) return env.AMAX_BASE_URL.replace(/\/$/, "");
  if (env.NODE_ENV === "production") throw new Error("amax: AMAX_BASE_URL must be set in production");
  const h = req instanceof Request ? req.headers : req;
  const host = h.get("host") ?? "";
  if (!LOOPBACK.test(host)) throw new Error("amax: set AMAX_BASE_URL (only loopback hosts work without it)");
  return `http://${host}`;
};

// 062: the marketing page renders without a database, where AMAX_BASE_URL may be unset. It then
// publishes no absolute URLs (canonical, Open Graph, sitemap) rather than a guessed one, and says so once.
// Invalid configuration still throws from loadEnv().
let warned = false;
export const knownOrigin = (h: Headers): string | null => {
  const env = loadEnv();
  if (env.AMAX_BASE_URL || (env.NODE_ENV !== "production" && LOOPBACK.test(h.get("host") ?? ""))) return baseUrl(h);
  if (env.NODE_ENV === "production" && !warned) {
    warned = true;
    console.warn("amax: AMAX_BASE_URL is unset, so the public page omits its canonical, Open Graph and sitemap URLs");
  }
  return null;
};
