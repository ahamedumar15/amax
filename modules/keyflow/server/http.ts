import { lookup as dnsLookup, type LookupAddress } from "node:dns";
import { request } from "node:https";
import { EgressError, guardedLookup, publicHttps } from "@amax/api/egress";
import { ChangesReply, KeyflowError, PushReply, type Batch, type KeyflowTransport } from "./transport";

// Keyflow over HTTPS, through the 035 egress guards: a public https endpoint only, the connection
// pinned to the address that was checked (so DNS rebinding can't swap in a private one), no
// redirects, a size cap and a timeout. The key goes only in the Authorization header.
type Lookup = ReturnType<typeof guardedLookup>;
type Resolve = (host: string) => Promise<LookupAddress[]>;
export type Wire = (url: URL, init: { body: string; headers: Record<string, string>; signal: AbortSignal }, lookup: Lookup) => Promise<{ status: number; body: string }>;

const MAX_BYTES = 10 * 1024 * 1024;
const TIMEOUT_MS = 60_000;

const systemResolve: Resolve = (host) => new Promise((ok, fail) => dnsLookup(host, { all: true, verbatim: true }, (e, a) => (e ? fail(e) : ok(a))));

const httpsWire: Wire = (url, init, lookup) =>
  new Promise((ok, fail) => {
    const req = request(url, { method: "POST", headers: { ...init.headers, "content-length": Buffer.byteLength(init.body) }, lookup: lookup as never, signal: init.signal }, (res) => {
      const chunks: Buffer[] = [];
      let size = 0;
      res.on("data", (c: Buffer) => {
        size += c.length;
        if (size > MAX_BYTES) req.destroy(new KeyflowError("Keyflow's answer was larger than 10 MB"));
        else chunks.push(c);
      });
      res.on("end", () => ok({ status: res.statusCode ?? 0, body: Buffer.concat(chunks).toString("utf8") }));
      res.on("error", fail);
    });
    req.on("error", fail);
    req.end(init.body);
  });

const deps: { wire: Wire; resolve: Resolve } = { wire: httpsWire, resolve: systemResolve };

/** Tests swap the wire and the resolver; the egress checks stay in the path. */
export function setKeyflowWire(d: Partial<typeof deps>) {
  Object.assign(deps, { wire: httpsWire, resolve: systemResolve }, d);
}

async function post(endpoint: string, key: string, path: string, body: unknown): Promise<unknown> {
  if (!publicHttps(endpoint)) throw new EgressError("refused: the Keyflow endpoint is not a public https address");
  const url = new URL(path, endpoint.endsWith("/") ? endpoint : `${endpoint}/`);
  const res = await deps.wire(url, { body: JSON.stringify(body), headers: { "content-type": "application/json", accept: "application/json", authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(TIMEOUT_MS) }, guardedLookup(deps.resolve));
  if (res.status < 200 || res.status >= 300) throw new KeyflowError(`Keyflow answered ${res.status}`);
  try {
    return JSON.parse(res.body);
  } catch {
    throw new KeyflowError("Keyflow's answer wasn't JSON");
  }
}

const parsed = <T>(schema: { safeParse: (v: unknown) => { success: true; data: T } | { success: false } }, v: unknown, what: string): T => {
  const r = schema.safeParse(v);
  if (!r.success) throw new KeyflowError(`Keyflow's ${what} answer wasn't in the expected shape`);
  return r.data;
};

export const httpTransport = (endpoint: string, key: string): KeyflowTransport => ({
  push: async (batch: Batch) => parsed(PushReply, await post(endpoint, key, "v1/sync/directory", batch), "directory"),
  changes: async (cursor) => parsed(ChangesReply, await post(endpoint, key, "v1/sync/changes", { cursor }), "changes"),
});
