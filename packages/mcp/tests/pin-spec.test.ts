import { z } from "zod";
import { describe, expect, it } from "vitest";
import type { McpToolDef } from "@amax/core";
import { createRegistry } from "../src";

const read = { permission: "", scope: "read" as const, readOnly: true, description: "One thing.", run: async () => null };
const of = (r: { id: string } | null) => (r ? { id: r.id, label: r.id } : null);
const build = (t: Partial<McpToolDef>) => () => createRegistry([{ id: "m", mcpTools: [{ ...read, name: "get_thing", input: z.object({}), ...t } as McpToolDef] }]);

// 059 AC-1: a tool that resolves pins to a record must resolve them by a UUID, so the registry (built
// at startup) refuses one that can't.
describe("059 AC1 the registry refuses a pin-resolving tool without an id path", () => {
  it.each([
    ["a record pin whose id field is missing", { input: z.object({ key: z.string() }), pin: { id: "thingId", of } }, /has no id path/],
    ["a record pin keyed on a plain string", { input: z.object({ thingId: z.string() }), pin: { id: "thingId", of } }, /must be a UUID/],
    ["a pin spec on a write tool", { scope: "write" as const, input: z.object({ thingId: z.uuid() }), pin: { id: "thingId", of } }, /isn't a read tool/],
  ])("AC1 refuses %s", (_n, t, why) => expect(build(t)).toThrow(why));

  it.each([
    ["a required UUID", { input: z.object({ thingId: z.uuid() }), pin: { id: "thingId", of } }],
    ["an optional UUID beside a key that only narrows", { input: z.object({ thingId: z.string().uuid().optional(), key: z.string().optional() }), pin: { id: "thingId", of } }],
    ["a view", { input: z.object({ week: z.string() }), pin: "view" as const }],
  ])("AC1 accepts %s", (_n, t) => expect(build(t)).not.toThrow());
});
