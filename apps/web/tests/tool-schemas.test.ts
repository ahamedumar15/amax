import { describe, expect, it } from "vitest";
import { toolInputSchema } from "@amax/ai/tool-schema";

describe("069 every chat tool sends a schema the provider accepts", { timeout: 60_000 }, () => {
  it("AC-2 each registered tool's input schema is a top-level object with no oneOf, anyOf or allOf", async () => {
    const { toolRegistry } = await import("../lib/server");
    const bad = toolRegistry().all
      .map((t) => ({ name: t.name, s: toolInputSchema(t.input) }))
      .filter(({ s }) => s.type !== "object" || "oneOf" in s || "anyOf" in s || "allOf" in s)
      .map((t) => t.name);
    expect(bad).toEqual([]);
  });
});
