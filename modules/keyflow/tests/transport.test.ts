import { afterEach, describe, expect, it } from "vitest";
import { httpTransport, setKeyflowWire, type Wire } from "../server/http";

const at = (address: string) => async () => [{ address, family: address.includes(":") ? 6 : 4 }];

describe("Keyflow over HTTPS, through the egress guards", () => {
  afterEach(() => setKeyflowWire({}));

  it("AC2 only a public https endpoint is called, on the checked address, with the key only in the header; a bad answer is an error, not data", async () => {
    const calls: { url: string; auth: string; body: string; resolved: string }[] = [];
    const wire = (status: number, body: string): Wire => async (url, init, lookup) => {
      const resolved = await new Promise<string>((ok, fail) => lookup(url.hostname, {}, (e, a) => (e ? fail(e) : ok(a as string))));
      calls.push({ url: url.toString(), auth: init.headers.authorization, body: init.body, resolved });
      return { status, body };
    };
    setKeyflowWire({ wire: wire(200, JSON.stringify({ refused: [{ ref: "p1", reason: "unknown team" }] })), resolve: at("93.184.216.34") });
    const kf = httpTransport("https://lumen.keyflow.example/api", "kf-secret-key");
    expect(await kf.push({ people: [], teams: [] })).toEqual({ refused: [{ ref: "p1", reason: "unknown team" }] });
    expect(calls).toEqual([{ url: "https://lumen.keyflow.example/api/v1/sync/directory", auth: "Bearer kf-secret-key", body: '{"people":[],"teams":[]}', resolved: "93.184.216.34" }]);

    setKeyflowWire({ wire: wire(200, "{}"), resolve: at("10.0.0.7") });
    await expect(kf.changes(null)).rejects.toThrow(/private address \(10\.0\.0\.7\)/);
    for (const endpoint of ["http://lumen.keyflow.example", "https://127.0.0.1", "https://keyflow.internal", "https://user:pw@lumen.keyflow.example"]) {
      await expect(httpTransport(endpoint, "k").changes(null)).rejects.toThrow(/not a public https address/);
    }
    setKeyflowWire({ wire: wire(302, ""), resolve: at("93.184.216.34") });
    await expect(kf.changes(null)).rejects.toThrow("Keyflow answered 302");
    setKeyflowWire({ wire: wire(200, '{"goals":"lots"}'), resolve: at("93.184.216.34") });
    await expect(kf.changes(null)).rejects.toThrow("Keyflow's changes answer wasn't in the expected shape");
  });
});
