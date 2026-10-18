import { describe, expect, it } from "vitest";
import { blockedReason, DEFAULT_POLICY, type AiPolicy } from "../src/policy";
import { aiEndpoint, configureEndpoint } from "../src/endpoint";

const inAu: AiPolicy = { ...DEFAULT_POLICY, zdrConfirmed: true, dataRegion: "AU", providerRegion: "AU", regions: { database: "AU", storage: "AU", ai: "AU" } };

// 044 AC-3: the Admin's "AI runs in AU" no longer passes the gate by itself.
describe("044 AC-3 the configured AI endpoint region is gated", () => {
  it.each([
    ["no endpoint region configured", { url: null, region: null }, /isn't configured on the server/],
    ["an unrecognised endpoint region", { url: "https://ai.example.test", region: "Atlantis" }, /isn't configured on the server/],
    ["an endpoint configured in another region", { url: "https://us.ai.example.test", region: "US" }, /configured in US, outside the data region \(AU\)/],
    ["an endpoint in the data region", { url: "https://au.ai.example.test", region: "Australia" }, null],
  ] as const)("%s", (_n, endpoint, expected) => {
    const reason = blockedReason(inAu, endpoint);
    if (expected) expect(reason).toMatch(expected);
    else expect(reason).toBeNull();
  });

  it("without a data region the endpoint region isn't required, and the gate reads the server's configuration by default", () => {
    expect(blockedReason({ ...inAu, dataRegion: null }, { url: null, region: null })).toBeNull();
    configureEndpoint({ url: "https://au.ai.example.test", region: "AU" });
    expect(aiEndpoint()).toEqual({ url: "https://au.ai.example.test", region: "AU" });
    expect(blockedReason(inAu)).toBeNull();
    configureEndpoint({});
    expect(blockedReason(inAu)).toMatch(/isn't configured on the server/);
  });
});
