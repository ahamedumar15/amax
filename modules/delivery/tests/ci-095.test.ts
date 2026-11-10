import { z } from "zod";
import { describe, expect, it } from "vitest";
import { mcpTools } from "../mcp";
import { knownTime } from "../server/repo-time";

// 095 AC-1: chat sends every tool's input as JSON Schema (packages/ai toolInputSchema); a zod transform can't convert,
// and one such tool broke every chat turn. Delivery's tools convert, and the future-date bound lives where dates are written.
describe("095 AC-1 tool inputs convert to JSON Schema", () => {
  it.each(mcpTools.map((t) => [t.name, t] as const))("%s", (_, t) => {
    expect(() => z.toJSONSchema(t.input as z.ZodType)).not.toThrow();
  });

  it.each([
    ["absent", undefined, null],
    ["null", null, null],
    ["in the past", "2026-10-01T00:00:00.000Z", "2026-10-01T00:00:00.000Z"],
    ["in the future", "2030-01-01T00:00:00.000Z", null],
  ])("a repo date %s is stored as %s", (_, t, want) => {
    expect(knownTime(t)).toBe(want);
  });
});
