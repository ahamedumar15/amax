// Paths that work signed out: sign-in itself, Auth.js callbacks, health, and machine endpoints that
// carry their own bearer auth (cron tick, SCIM).
const PUBLIC = [/^\/signin(\/|$)/, /^\/api\/auth(\/|$)/, /^\/healthz$/, /^\/api\/jobs\/tick$/, /^\/api\/scim(\/|$)/,
  // 004: MCP and its OAuth endpoints authenticate with bearer tokens / PKCE, not the web session.
  /^\/api\/mcp$/, /^\/\.well-known\//, /^\/oauth\/(token|register|revoke)$/];

export const isPublicPath = (pathname: string) => PUBLIC.some((re) => re.test(pathname));

// Signed-out visitors go to /signin, remembering where they were headed.
export function gate(url: URL, signedIn: boolean): URL | null {
  if (signedIn || isPublicPath(url.pathname)) return null;
  const to = new URL("/signin", url);
  if (url.pathname !== "/") to.searchParams.set("next", url.pathname + url.search);
  return to;
}
