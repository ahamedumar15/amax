import { lookup as dnsLookup, type LookupAddress } from "node:dns";
import { request } from "node:https";
import { EgressError, guardedLookup, publicHttps, safeRequest } from "@amax/api/egress";

// Graph over HTTPS through the 035 egress guards: public https to graph.microsoft.com only, the
// connection pinned to the checked address, no redirects, a 4 MB cap and a 30 s timeout.
type Resolve = (host: string) => Promise<LookupAddress[]>;
export type Get = (url: URL, headers: Record<string, string>, lookup: ReturnType<typeof guardedLookup>, signal: AbortSignal) => Promise<{ status: number; body: string }>;
export type Post = (url: string, init: { body: string; headers: Record<string, string>; signal: AbortSignal }) => Promise<{ status: number; body: string }>;

const MAX_BYTES = 4 * 1024 * 1024;
const TIMEOUT_MS = 30_000;
const HOSTS = new Set(["graph.microsoft.com", "login.microsoftonline.com"]);
const systemResolve: Resolve = (host) => new Promise((ok, fail) => dnsLookup(host, { all: true, verbatim: true }, (e, a) => (e ? fail(e) : ok(a))));

const httpsGet: Get = (url, headers, lookup, signal) => new Promise((ok, fail) => {
  const req = request(url, { method: "GET", headers, lookup: lookup as never, signal }, (res) => {
    const chunks: Buffer[] = [];
    let size = 0;
    res.on("data", (c: Buffer) => { size += c.length; if (size > MAX_BYTES) req.destroy(new EgressError("Microsoft Graph's answer was larger than 4 MB")); else chunks.push(c); });
    res.on("end", () => ok({ status: res.statusCode ?? 0, body: Buffer.concat(chunks).toString("utf8") }));
    res.on("error", fail);
  });
  req.on("error", fail);
  req.end();
});

const deps: { get: Get; post: Post; resolve: Resolve } = { get: httpsGet, post: safeRequest, resolve: systemResolve };
/** Tests swap the wire; the host and egress checks stay in the path. */
export const setGraphWire = (d: Partial<typeof deps> | null) => void Object.assign(deps, { get: httpsGet, post: safeRequest, resolve: systemResolve }, d ?? {});

const allowed = (url: string) => {
  if (!publicHttps(url) || !HOSTS.has(new URL(url).hostname)) throw new EgressError("refused: not Microsoft Graph");
};

export async function getJson(url: string, token: string): Promise<unknown> {
  allowed(url);
  const r = await deps.get(new URL(url), { authorization: `Bearer ${token}`, accept: "application/json" }, guardedLookup(deps.resolve), AbortSignal.timeout(TIMEOUT_MS));
  if (r.status < 200 || r.status > 299) throw new GraphError(`Microsoft Graph answered ${r.status}`);
  return JSON.parse(r.body);
}

export async function postJson(url: string, body: string, headers: Record<string, string>): Promise<unknown> {
  allowed(url);
  const r = await deps.post(url, { body, headers, signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (r.status < 200 || r.status > 299) throw new GraphError(`Microsoft ${url.includes("login.") ? "sign-in" : "Graph"} answered ${r.status}`);
  return r.body ? JSON.parse(r.body) : {};
}

/** A failure talking to Microsoft: its message is what the screen and the run show, never a secret. */
export class GraphError extends Error {
  readonly retryable = false;
  constructor(message: string) {
    super(message);
    this.name = "GraphError";
  }
}
