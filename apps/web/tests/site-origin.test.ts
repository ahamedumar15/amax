import { afterEach, describe, expect, it, vi } from "vitest";

describe("062 AC-2 AC-7 the public page publishes only a configured origin", () => {
  afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); vi.resetModules(); });
  const origin = async (nodeEnv: string, base: string | undefined, host: string) => {
    vi.stubEnv("NODE_ENV", nodeEnv);
    vi.stubEnv("AMAX_BASE_URL", base);
    return (await import("../lib/site")).knownOrigin(new Headers({ host }));
  };
  it.each([
    ["production, set", "production", "https://amax.example/", "evil.example", "https://amax.example"],
    ["development, unset, loopback", "development", undefined, "localhost:3510", "http://localhost:3510"],
    ["development, unset, foreign host", "development", undefined, "evil.example", null],
  ])("%s", async (_name, nodeEnv, base, host, want) => {
    expect(await origin(nodeEnv, base, host)).toBe(want);
  });
  it("production, unset: no origin, and it says so once", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(await origin("production", undefined, "localhost:3000")).toBeNull();
    expect((await import("../lib/site")).knownOrigin(new Headers({ host: "localhost:3000" }))).toBeNull();
    expect(warn).toHaveBeenCalledTimes(1);
  });
  it.each([["not a url"], ["ftp//x"]])("production, malformed AMAX_BASE_URL %s throws instead of hiding", async (bad) => {
    await expect(origin("production", bad, "localhost:3000")).rejects.toThrow();
  });
});
