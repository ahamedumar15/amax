import { describe, expect, it } from "vitest";
import { guardedLookup, publicHttps, safePost, setEgress } from "../src";

// Review 058 B8: outgoing webhooks reach only public receivers, checked by URL and again on the
// address the host resolves to at delivery.
describe("058 SSRF guard on outgoing webhooks", () => {
  const refused = [
    ["loopback", "https://127.0.0.1/x"],
    ["loopback, decimal", "https://2130706433/x"],
    ["loopback, octal", "https://0177.0.0.1/x"],
    ["loopback, hex", "https://0x7f.1/x"],
    ["unspecified", "https://0.0.0.0/x"],
    ["CGNAT", "https://100.64.1.2/x"],
    ["cloud metadata", "https://169.254.169.254/latest"],
    ["IPv6 loopback", "https://[::1]/x"],
    ["IPv4-mapped IPv6", "https://[::ffff:127.0.0.1]/x"],
    ["IPv4-mapped IPv6, hex", "https://[::ffff:7f00:1]/x"],
    ["IPv6 unique local", "https://[fd00::1]/x"],
    ["IPv6 link-local", "https://[fe80::1]/x"],
    ["NAT64", "https://[64:ff9b::a00:1]/x"],
    ["6to4", "https://[2002:7f00:1::1]/x"],
    ["k3s service name", "https://api.default.svc.cluster.local/x"],
    ["GCP metadata name", "https://metadata.google.internal/x"],
    ["localhost", "https://localhost/x"],
    ["single-label name", "https://intranet/x"],
    ["credentials", "https://user:pw@hooks.example.com/x"],
    ["plain http", "http://hooks.example.com/x"],
  ] as const;
  it.each(refused)("refuses %s at subscribe", (_, url) => expect(publicHttps(url)).toBe(false));

  it.each([["public name", "https://hooks.example.com/in"], ["public IPv4", "https://1.1.1.1/in"], ["public IPv6", "https://[2606:4700::1111]/in"]])("accepts %s", (_, url) => expect(publicHttps(url)).toBe(true));

  const lookupOf = (answers: string[]) =>
    new Promise<string | null>((ok) => guardedLookup(async () => answers.map((address) => ({ address, family: address.includes(":") ? 6 : 4 })))("hooks.example.com", { all: true }, (e) => ok(e ? e.message : null)));

  it.each([
    ["a name that resolves to loopback (wildcard DNS, rebinding)", ["127.0.0.1"]],
    ["a name with one private answer among public ones", ["1.1.1.1", "10.0.0.5"]],
    ["a name that resolves to a mapped address", ["::ffff:169.254.169.254"]],
    ["a name that resolves to CGNAT", ["100.100.100.200"]],
    ["a name with no answers", []],
  ])("refuses %s at delivery", async (_, answers) => expect(await lookupOf(answers)).toMatch(/private address/));

  it("connects only through the checked lookup, so a rebinding answer never reaches the wire", async () => {
    let wired = false;
    setEgress({
      resolve: async () => [{ address: "127.0.0.1", family: 4 }],
      send: (url, _init, lookup) => new Promise((ok, fail) => lookup(url.hostname, {}, (e) => (e ? fail(e) : ((wired = true), ok(204))))),
    });
    try {
      await expect(safePost("https://127.0.0.1.nip.io/x", { body: "{}", headers: {}, signal: new AbortController().signal })).rejects.toThrow(/private address/);
      await expect(safePost("https://[::ffff:7f00:1]/x", { body: "{}", headers: {}, signal: new AbortController().signal })).rejects.toThrow(/not a public https address/);
      expect(wired).toBe(false);
    } finally {
      setEgress({});
    }
  });
});
