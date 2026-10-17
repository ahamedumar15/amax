import { describe, expect, it } from "vitest";
import { clockFromEnv, loadEnv } from "../src/env";
import { configureRuntime, now } from "../src/service";

// 041 review round 1: "today" comes from validated config through the runtime, not process.env in module code.
describe("AMAX_TODAY clock", () => {
  it.each([
    ["a valid date pins the clock to mid-afternoon UTC", "2026-10-16", "2026-10-16T15:00:00.000Z"],
    ["a leap day", "2028-02-29", "2028-02-29T15:00:00.000Z"],
    ["the first day of a year", "2027-01-01", "2027-01-01T15:00:00.000Z"],
  ])("%s", (_, AMAX_TODAY, iso) => {
    expect(clockFromEnv(loadEnv({ AMAX_TODAY }))().toISOString()).toBe(iso);
  });

  it.each([["not a date", "yesterday"], ["an impossible date", "2026-02-30"], ["a timestamp", "2026-10-16T09:00:00Z"]])("rejects %s at boot", (_, AMAX_TODAY) => {
    expect(() => loadEnv({ AMAX_TODAY })).toThrow(/AMAX_TODAY/);
  });

  it("is the real time when unset, and now() follows the runtime's clock", () => {
    const before = Date.now();
    expect(clockFromEnv(loadEnv({}))().getTime()).toBeGreaterThanOrEqual(before);
    configureRuntime({ db: {} as never, auditKey: "k".repeat(32), now: clockFromEnv({ AMAX_TODAY: "2026-10-16" }) });
    expect(now().toISOString()).toBe("2026-10-16T15:00:00.000Z");
  });
});
