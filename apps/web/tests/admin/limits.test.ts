import { afterAll, describe, expect, it } from "vitest";
import { configureRateLimits, limitsFromEnv, rateLimits } from "@amax/core/server";
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
