import { afterEach, describe, expect, it, vi } from "vitest";

// Review round 1: the OAuth issuer and MCP audience must not come from request headers.
describe("baseUrl", () => {
  afterEach(() => { vi.unstubAllEnvs(); vi.resetModules(); });
  const load = async () => (await import("../lib/server")).baseUrl;
  const req = (headers: Record<string, string>) => new Request("http://x/", { headers });

  it("uses AMAX_BASE_URL and ignores forwarded headers", async () => {
    vi.stubEnv("AMAX_BASE_URL", "https://amax.example/");
    expect((await load())(req({ host: "evil.example", "x-forwarded-host": "evil.example", "x-forwarded-proto": "https" }))).toBe("https://amax.example");
  });
  it.each([["evil.example"], ["amax.example.evil.com"], ["localhost.evil.com"]])("refuses a non-loopback host %s without AMAX_BASE_URL", async (host) => {
    expect(() => {}).not.toThrow();
    await expect((async () => (await load())(req({ host })))()).rejects.toThrow(/AMAX_BASE_URL/);
  });
  it("accepts loopback in development", async () => {
    expect((await load())(req({ host: "localhost:3501", "x-forwarded-host": "evil.example" }))).toBe("http://localhost:3501");
  });
  it("requires AMAX_BASE_URL in production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    await expect((async () => (await load())(req({ host: "localhost:3000" })))()).rejects.toThrow(/production/);
  });
});
