import { loadEnv } from "@amax/core/env";

// 004: the public base URL (for OAuth metadata, the MCP audience and, since 062, the marketing page's canonical URL and sitemap).
// The public origin is configuration, never request headers: it becomes the OAuth issuer and the
// MCP token audience (review round 1, B6). Outside production a loopback host may stand in.
export const baseUrl = (req: Request | Headers) => {
  const env = loadEnv();
  if (env.AMAX_BASE_URL) return env.AMAX_BASE_URL.replace(/\/$/, "");
  if (env.NODE_ENV === "production") throw new Error("amax: AMAX_BASE_URL must be set in production");
  const h = req instanceof Request ? req.headers : req;
  const host = h.get("host") ?? "";
  if (!/^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(host)) throw new Error("amax: set AMAX_BASE_URL (only loopback hosts work without it)");
  return `http://${host}`;
};

// 062: the marketing page renders without a database, where AMAX_BASE_URL may be unset. It then
// publishes no absolute URLs (canonical, Open Graph, sitemap) rather than a guessed or localhost one.
export const knownOrigin = (h: Headers): string | null => {
  try {
    return baseUrl(h);
  } catch {
    return null;
  }
};
