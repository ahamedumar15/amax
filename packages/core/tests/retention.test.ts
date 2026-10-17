import { describe, expect, it } from "vitest";
import { defineModule } from "../src/module";

describe("retention entries are checked at manifest load (review rounds 3 and 4)", () => {
  const base = { id: "m", name: "M", routes: [{ path: "", component: () => null }], nav: [], permissions: [] } as never as Parameters<typeof defineModule>[0];
  const entry = (start: { at: string[]; idle?: `P${string}` }) => ({ table: "m.t", fields: ["name"], class: "personal" as const, period: "P1Y" as const, start, action: "delete" as const });
  it("accepts a start column, an idle period, or both", () => {
    expect(() => defineModule({ ...base, retention: [entry({ at: ["closed_at"] }), entry({ at: [], idle: "P1Y" }), entry({ at: ["released_at"], idle: "P1Y" })] })).not.toThrow();
  });
  it("refuses a clock that never starts", () => {
    expect(() => defineModule({ ...base, retention: [entry({ at: [] })] })).toThrow(/never starts/);
  });
});
