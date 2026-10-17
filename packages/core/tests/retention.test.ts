import { describe, expect, it } from "vitest";
import { defineModule } from "../src/module";

// Review round 3: a retention clock can only start on an event the module actually emits.
describe("retention starts are checked at manifest load", () => {
  const base = { id: "m", name: "M", routes: [{ path: "", component: () => null }], nav: [], permissions: [] } as never as Parameters<typeof defineModule>[0];
  const entry = (events: string[]) => ({ table: "m.t", fields: ["name"], class: "personal" as const, period: "P1Y" as const, start: { events, idle: "P1Y" as const }, action: "delete" as const });
  it("accepts emitted events and idle-only clocks", () => {
    expect(() => defineModule({ ...base, events: { emits: ["m.done"] }, retention: [entry(["m.done"]), entry([])] })).not.toThrow();
  });
  it("refuses an event the module doesn't emit", () => {
    expect(() => defineModule({ ...base, events: { emits: [] }, retention: [entry(["m.closed"])] })).toThrow(/m\.closed, which it doesn't emit/);
  });
});
