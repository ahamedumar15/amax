// Reads go to these fixed hosts only. `@amax/api/egress` is POST-only, so token requests use it and
// GETs use fetch against this allowlist (no redirects followed). Errors never carry the credential.
const HOSTS = new Set(["graph.microsoft.com", "vsaex.dev.azure.com", "api.github.com"]);

export class SourceError extends Error {
  constructor(what: string, status?: number) {
    super(status ? `${what} answered HTTP ${status}` : what);
    this.name = "SourceError";
  }
}

export async function getJson<T>(url: string, headers: Record<string, string>, signal: AbortSignal, what: string): Promise<T> {
  const u = new URL(url);
  if (u.protocol !== "https:" || !HOSTS.has(u.hostname)) throw new SourceError(`refused: ${u.hostname} isn't a known ${what} host`);
  const r = await fetch(u, { headers: { accept: "application/json", ...headers }, signal, redirect: "error" });
  if (!r.ok) throw new SourceError(what, r.status);
  return (await r.json()) as T;
}

/** Follows Graph's @odata.nextLink, up to `pages` pages. */
export async function allPages<T>(url: string, headers: Record<string, string>, signal: AbortSignal, pages = 20): Promise<T[]> {
  const out: T[] = [];
  let next: string | undefined = url;
  for (let i = 0; next && i < pages; i++) {
    const page: { value: T[]; "@odata.nextLink"?: string } = await getJson(next, headers, signal, "Microsoft Graph");
    out.push(...page.value);
    next = page["@odata.nextLink"];
  }
  return out;
}

export const parseSecret = <T>(value: string, keys: (keyof T & string)[], what: string): T => {
  let v: Record<string, unknown>;
  try { v = JSON.parse(value) as Record<string, unknown>; } catch { throw new SourceError(`the ${what} credential isn't JSON`); }
  const missing = keys.filter((k) => typeof v[k] !== "string" || !v[k]);
  if (missing.length) throw new SourceError(`the ${what} credential needs ${missing.join(", ")}`);
  return v as T;
};
