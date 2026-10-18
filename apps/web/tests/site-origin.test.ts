import { afterEach, describe, expect, it, vi } from "vitest";
import { knownOrigin } from "../lib/site";

describe("062 AC-2 AC-7 the public page publishes only a configured origin", () => {
  afterEach(() => vi.unstubAllEnvs());
  const h = (host: string) => new Headers({ host });
  it.each([
    ["production, unset", "production", undefined, "localhost:3000", null],
    ["production, set", "production", "https://amax.example/", "evil.example", "https://amax.example"],
    ["development, unset, loopback", "development", undefined, "localhost:3510", "http://localhost:3510"],
    ["development, unset, foreign host", "development", undefined, "evil.example", null],
  ])("%s", (_name, nodeEnv, base, host, want) => {
    vi.stubEnv("NODE_ENV", nodeEnv);
    vi.stubEnv("AMAX_BASE_URL", base);
    expect(knownOrigin(h(host))).toBe(want);
  });
});
