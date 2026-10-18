import { lookup as dnsLookup, type LookupAddress } from "node:dns";
import { BlockList, isIP } from "node:net";
import { request } from "node:https";

// Outgoing webhooks go only to public receivers (review 058 B8). The URL is checked when it is
// subscribed, and again at delivery on the address the host resolves to, and the connection is made
// to that checked address, so DNS rebinding can't swap in a private one between check and connect.

// Two lists: Node matches an IPv4 address against IPv4-mapped IPv6 rules, so one list would refuse all of IPv4.
const blocked4 = new BlockList();
const blocked6 = new BlockList();
const V4: [string, number][] = [
  ["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10], ["127.0.0.0", 8], ["169.254.0.0", 16], ["172.16.0.0", 12], ["192.0.0.0", 24], ["192.0.2.0", 24],
  ["192.88.99.0", 24], ["192.168.0.0", 16], ["198.18.0.0", 15], ["198.51.100.0", 24], ["203.0.113.0", 24], ["224.0.0.0", 4], ["240.0.0.0", 4],
];
// v4-mapped, v4-compatible, NAT64, 6to4 and Teredo all carry an IPv4 address inside, so they are refused whole.
const V6: [string, number][] = [
  ["::", 96], ["::ffff:0:0", 96], ["64:ff9b::", 96], ["64:ff9b:1::", 48], ["100::", 64], ["2001::", 32], ["2001:db8::", 32], ["2002::", 16],
  ["fc00::", 7], ["fe80::", 10], ["fec0::", 10], ["ff00::", 8],
];
for (const [a, p] of V4) blocked4.addSubnet(a, p, "ipv4");
for (const [a, p] of V6) blocked6.addSubnet(a, p, "ipv6");

/** True only for a public unicast address. Anything unparseable is not public. */
export function publicAddress(address: string): boolean {
  const ip = address.replace(/^\[|\]$/g, "");
  const v = isIP(ip);
  if (!v) return false;
  return v === 4 ? !blocked4.check(ip, "ipv4") : !blocked6.check(ip, "ipv6");
}

// Names that only resolve inside a network: never a public receiver.
const INTERNAL_NAME = /(^|\.)(localhost|local|localdomain|internal|intranet|lan|home\.arpa|svc|corp)\.?$/i;

/** The subscribe-time filter: https, no credentials, and a public IP or a dotted public-looking name. */
export function publicHttps(url: string): boolean {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return false;
  }
  if (u.protocol !== "https:" || u.username || u.password) return false;
  // WHATWG URL already turns decimal, octal and hex IPv4 forms into dotted quads.
  const host = u.hostname.replace(/^\[|\]$/g, "");
  if (isIP(host)) return publicAddress(host);
  return host.includes(".") && !INTERNAL_NAME.test(host);
}

export class EgressError extends Error {
  readonly retryable = false;
  constructor(message: string) {
    super(message);
    this.name = "EgressError";
  }
}

type Resolve = (host: string) => Promise<LookupAddress[]>;
type Lookup = (host: string, options: { all?: boolean; family?: number }, cb: (err: Error | null, address: string | LookupAddress[], family?: number) => void) => void;
type Send = (url: URL, init: { body: string; headers: Record<string, string>; signal: AbortSignal }, lookup: Lookup) => Promise<number>;

const systemResolve: Resolve = (host) => new Promise((ok, fail) => dnsLookup(host, { all: true, verbatim: true }, (e, a) => (e ? fail(e) : ok(a))));

/** A DNS lookup that answers only with public addresses: one private answer refuses the whole host. */
export function guardedLookup(resolve: Resolve): Lookup {
  return (host, options, cb) => {
    resolve(host).then((all) => {
      const bad = all.find((a) => !publicAddress(a.address));
      if (!all.length || bad) return cb(new EgressError(`refused: ${host} resolves to a private address${bad ? ` (${bad.address})` : ""}`), "", 0);
      if (options.all) return cb(null, all);
      return cb(null, all[0].address, all[0].family);
    }, (e: Error) => cb(e, "", 0));
  };
}

type Exchange = (url: URL, init: { body: string; headers: Record<string, string>; signal: AbortSignal }, lookup: Lookup) => Promise<{ status: number; body: string }>;
const MAX_BODY = 64 * 1024;

// The answer's body is read up to 64 KB (an OAuth token, say) and the rest is dropped.
const httpsExchange: Exchange = (url, init, lookup) =>
  new Promise((ok, fail) => {
    const req = request(url, { method: "POST", headers: { ...init.headers, "content-length": Buffer.byteLength(init.body) }, lookup: lookup as never, signal: init.signal }, (res) => {
      let body = "";
      res.setEncoding("utf8");
      res.on("data", (chunk: string) => { if (body.length < MAX_BODY) body += chunk.slice(0, MAX_BODY - body.length); });
      res.on("end", () => ok({ status: res.statusCode ?? 0, body }));
      res.on("error", fail);
    });
    req.on("error", fail);
    req.end(init.body);
  });

const httpsSend: Send = (url, init, lookup) => httpsExchange(url, init, lookup).then((r) => r.status);

const deps: { resolve: Resolve; send: Send; exchange: Exchange } = { resolve: systemResolve, send: httpsSend, exchange: httpsExchange };

/** Tests swap the resolver and the wire; the checks above stay in the path. */
export function setEgress(d: Partial<typeof deps>) {
  Object.assign(deps, { resolve: systemResolve, send: httpsSend, exchange: httpsExchange }, d);
}

/** POSTs to a public receiver only, pinned to the address that was checked. Redirects are not followed. */
export async function safePost(url: string, init: { body: string; headers: Record<string, string>; signal: AbortSignal }): Promise<number> {
  if (!publicHttps(url)) throw new EgressError("refused: the webhook URL is not a public https address");
  return deps.send(new URL(url), init, guardedLookup(deps.resolve));
}

/** safePost's checks, returning the answer's status and body (Microsoft Graph's token and mail calls, 030). */
export async function safeRequest(url: string, init: { body: string; headers: Record<string, string>; signal: AbortSignal }): Promise<{ status: number; body: string }> {
  if (!publicHttps(url)) throw new EgressError("refused: the URL is not a public https address");
  return deps.exchange(new URL(url), init, guardedLookup(deps.resolve));
}
