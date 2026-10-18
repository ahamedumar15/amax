import { afterAll, describe, expect, it, vi } from "vitest";
import { loadEnv } from "../src/env";
import { configureRateLimits, limitsFromEnv, pageChannel, takeRate } from "../src/rate-limit";

const T = "35353535-0000-4000-8000-0000000000aa";
const page = (headers: Record<string, string>, method = "GET") => {
  const channel = pageChannel(method, new Headers(headers));
  return channel ? takeRate({ tenantId: T, userId: "u1", channel }).ok : true;
};

describe("035 AC-5 / 060 AC-4 the page limit counts navigations, and headers can't skip it", () => {
  afterAll(() => configureRateLimits({ now: Date.now }));

  it("AC4 prefetches use their own budget and only POST server actions are exempt; document loads and RSC navigations count", () => {
    configureRateLimits({ ...limitsFromEnv(loadEnv({ AMAX_RATE_PAGE_USER: "3" })), now: () => 1_800_000_000_000 });
    for (let i = 0; i < 5; i++) {
      expect(page({ "next-router-prefetch": "1", rsc: "1" })).toBe(true);
      expect(page({ purpose: "prefetch" })).toBe(true);
      expect(page({ "sec-purpose": "prefetch;prerender" })).toBe(true);
      expect(page({ "next-action": "abc123" }, "POST")).toBe(true);
    }
    expect([page({ accept: "text/html" }), page({ rsc: "1" }), page({ accept: "text/html" }), page({ rsc: "1" })]).toEqual([true, true, true, false]);
    // 060 AC-4: a GET with spoofed action or prefetch headers still renders, so it can't skip the limit.
    expect(page({ "next-action": "abc123" })).toBe(false);
    configureRateLimits({ ...limitsFromEnv(loadEnv({ AMAX_RATE_PAGE_USER: "3" })), now: () => 1_800_000_060_000 });
    expect(Array.from({ length: 31 }, () => page({ "next-router-prefetch": "1", "next-action": "x" })).filter(Boolean)).toHaveLength(30);
    expect(page({ accept: "text/html" })).toBe(true);
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
