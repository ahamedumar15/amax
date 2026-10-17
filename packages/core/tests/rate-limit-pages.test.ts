import { afterAll, describe, expect, it } from "vitest";
import { loadEnv } from "../src/env";
import { configureRateLimits, countsAsPage, limitsFromEnv, takeRate } from "../src/rate-limit";

const T = "35353535-0000-4000-8000-0000000000aa";
const page = (headers: Record<string, string>) => (countsAsPage(new Headers(headers)) ? takeRate({ tenantId: T, userId: "u1", channel: "page" }).ok : true);

describe("035 AC-5 the page limit counts navigations only", () => {
  afterAll(() => configureRateLimits({ now: Date.now }));

  it("AC5 prefetches and server actions don't consume the budget; document loads and RSC navigations do", () => {
    configureRateLimits({ ...limitsFromEnv(loadEnv({ AMAX_RATE_PAGE_USER: "3" })), now: () => 1_800_000_000_000 });
    for (let i = 0; i < 20; i++) {
      expect(page({ "next-router-prefetch": "1", rsc: "1" })).toBe(true);
      expect(page({ purpose: "prefetch" })).toBe(true);
      expect(page({ "sec-purpose": "prefetch;prerender" })).toBe(true);
      expect(page({ "next-action": "abc123" })).toBe(true);
    }
    expect([page({ accept: "text/html" }), page({ rsc: "1" }), page({ accept: "text/html" }), page({ rsc: "1" })]).toEqual([true, true, true, false]);
    expect(() => loadEnv({ AMAX_RATE_CALL_USER: "0" })).toThrow(/AMAX_RATE_CALL_USER/);
  });
});
