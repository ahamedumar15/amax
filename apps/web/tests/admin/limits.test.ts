import { afterAll, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { configureRateLimits, limitsFromEnv, rateLimits, takeRate } from "@amax/core/server";
import { wireRateLimits } from "../../lib/rate-wiring";
import { loadEnv } from "@amax/core/env";
import { limitText } from "../../app/(app)/settings/api/LimitTable";

// Review 058 B4: the API screen shows the limits the limiter enforces (AMAX_RATE_*), not a copy.
describe("058 the rate-limit table renders the configured limits", () => {
  afterAll(() => configureRateLimits({}));
  it.each([
    [{}, { page: "600 a minute per person", rest: "120 a minute per token, 240 per person", chat: "240 a minute per person" }],
    [{ AMAX_RATE_PAGE_USER: "90", AMAX_RATE_CALL_TOKEN: "30", AMAX_RATE_CALL_USER: "45" }, { page: "90 a minute per person", rest: "30 a minute per token, 45 per person", chat: "45 a minute per person" }],
    [{ AMAX_RATE_CALL_USER: "1500" }, { page: "600 a minute per person", rest: "120 a minute per token, 1,500 per person", chat: "1,500 a minute per person" }],
  ])("env %j", (env, want) => {
    configureRateLimits(limitsFromEnv(loadEnv(env)));
    const l = rateLimits();
    expect({ page: limitText("page", l), rest: limitText("rest", l), chat: limitText("chat", l) }).toEqual(want);
    expect(limitText("mcp", l)).toBe(want.rest);
  });
});

// Review 058 rounds 2 and 3: the proxy wires its own limits and recorder (wireProxy), so page 429s are
// recorded on every host, not only where it shares a process with the app.
describe("058 every bundle that limits wires the env limits and the recorder", () => {
  afterAll(() => configureRateLimits({}));
  it.each([["page", "2"], ["rest", "3"], ["chat", "4"]] as const)("the %s limit from env %s, and its 429 reaches the sink", (channel, n) => {
    const seen: string[] = [];
    wireRateLimits(loadEnv({ AMAX_RATE_PAGE_USER: n, AMAX_RATE_CALL_USER: n, AMAX_RATE_CALL_TOKEN: n }), (l) => void seen.push(l.channel));
    const take = () => takeRate({ tenantId: "t-058", userId: `u-${channel}`, channel }).ok;
    const results = Array.from({ length: Number(n) + 1 }, take);
    expect(results.filter(Boolean)).toHaveLength(Number(n));
    expect(seen).toEqual([channel]);
  });

  // tests/admin/proxy-wiring.test.ts drives wireProxy in separate bundles against Postgres; this pins
  // that the proxy entry calls it before it limits.
  it("the proxy entry calls wireProxy before it takes from the page limit", () => {
    const src = readFileSync(join(__dirname, "../../proxy.ts"), "utf8");
    expect(src.indexOf("wireProxy();")).toBeGreaterThan(-1);
    expect(src.indexOf("wireProxy();")).toBeLessThan(src.indexOf("takeRate("));
  });
});

