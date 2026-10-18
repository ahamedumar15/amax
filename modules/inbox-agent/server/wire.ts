import { lookup as dnsLookup, type LookupAddress } from "node:dns";
import { request } from "node:https";
import { EgressError, guardedLookup, publicHttps, safeRequest } from "@amax/api/egress";

// Graph over HTTPS through the 035 egress guards: public https only, the connection pinned to the
// checked address, no redirects, a 2 MB cap and a 30 s timeout. The token goes only in a header.
type Resolve = (host: string) => Promise<LookupAddress[]>;
export type Get = (url: URL, headers: Record<string, string>, lookup: ReturnType<typeof guardedLookup>, signal: AbortSignal) => Promise<{ status: number; body: string }>;
export type Post = (url: string, init: { body: string; headers: Record<string, string>; signal: AbortSignal }) => Promise<{ status: number; body: string }>;

const MAX_BYTES = 2 * 1024 * 1024;
const TIMEOUT_MS = 30_000;
const systemResolve: Resolve = (host) => new Promise((ok, fail) => dnsLookup(host, { all: true, verbatim: true }, (e, a) => (e ? fail(e) : ok(a))));

const httpsGet: Get = (url, headers, lookup, signal) =>
  new Promise((ok, fail) => {
    const req = request(url, { method: "GET", headers, lookup: lookup as never, signal }, (res) => {
      const chunks: Buffer[] = [];
      let size = 0;
      res.on("data", (c: Buffer) => {
        size += c.length;
        if (size > MAX_BYTES) req.destroy(new EgressError("Microsoft Graph's answer was larger than 2 MB"));
        else chunks.push(c);
      });
      res.on("end", () => ok({ status: res.statusCode ?? 0, body: Buffer.concat(chunks).toString("utf8") }));
      res.on("error", fail);
    });
    req.on("error", fail);
    req.end();
  });

const deps: { get: Get; post: Post; resolve: Resolve } = { get: httpsGet, post: safeRequest, resolve: systemResolve };
/** Tests swap the wire; the egress checks stay in the path. */
export const setGraphWire = (d: Partial<typeof deps>) => void Object.assign(deps, { get: httpsGet, post: safeRequest, resolve: systemResolve }, d);

export async function getJson(url: string, token: string): Promise<unknown> {
  if (!publicHttps(url)) throw new EgressError("refused: not a public https address");
  const r = await deps.get(new URL(url), { authorization: `Bearer ${token}`, accept: "application/json" }, guardedLookup(deps.resolve), AbortSignal.timeout(TIMEOUT_MS));
  if (r.status < 200 || r.status > 299) throw new GraphError(`Microsoft Graph answered ${r.status}`);
  return JSON.parse(r.body);
}

export async function postForm(url: string, form: Record<string, string>): Promise<unknown> {
  const r = await deps.post(url, { body: new URLSearchParams(form).toString(), headers: { "content-type": "application/x-www-form-urlencoded" }, signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (r.status < 200 || r.status > 299) throw new GraphError(`Microsoft sign-in answered ${r.status}`);
  return JSON.parse(r.body);
}

/** A failure talking to Microsoft: its message is what the screen shows, so it never carries a secret. */
export class GraphError extends Error {
  readonly retryable = false;
  constructor(message: string) {
    super(message);
    this.name = "GraphError";
  }
}
