import { afterAll, describe, expect, it, vi } from "vitest";
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

// Review 058 B6: the proxy and the app are separate bundles with their own copy of this module. The
// limits, counts and sink the app configures must be the ones the proxy's copy enforces.
describe("058 one limiter per process, whichever bundle imports it", () => {
  type RL = typeof import("../src/rate-limit");
  const fresh = async (): Promise<RL> => {
    vi.resetModules();
    return import("../src/rate-limit");
  };
  afterAll(async () => (await fresh()).configureRateLimits({ now: Date.now }));

  it.each(["page", "rest", "mcp", "chat"] as const)("the %s limit and sink configured by the app apply in the proxy's copy", async (channel) => {
    const app = await fresh();
    const proxy = await fresh();
    expect(proxy).not.toBe(app);
    const limited: string[] = [];
    app.configureRateLimits({ page: { user: 2, token: 2 }, call: { user: 2, token: 2 }, sink: (l) => void limited.push(l.channel), now: () => 1_900_000_000_000 });
    const take = () => proxy.takeRate({ tenantId: T, userId: `u-${channel}`, channel }).ok;
    expect([take(), take(), take()]).toEqual([true, true, false]);
    expect(limited).toEqual([channel]);
    expect(proxy.rateLimits().page.user).toBe(2);
  });
});
