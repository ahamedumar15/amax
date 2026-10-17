import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import type { McpToolDef } from "@amax/core";
import type { Viewer } from "@amax/auth";

// 052 review: recording the tool_call step must never change what the caller is told. A write that
// ran is reported as done even when the step can't be written, a refusal or failure is reported as
// itself (never as the trace store's error), and each outcome is recorded once.
const steps: string[] = [];
let stepFails = false;
vi.mock("@amax/core/server", async (orig) => ({
  ...(await orig<typeof import("@amax/core/server")>()),
  traceStep: vi.fn(async (s: { detail: { outcome: string } }) => {
    steps.push(s.detail.outcome);
    if (stepFails) throw new Error("trace store down");
  }),
}));

const { createRegistry } = await import("../src/registry");
const { ForbiddenError } = await import("@amax/core/server");

const viewer = { tenantId: "t", userId: "u", name: "Maya (fictional)", email: "m@x.test", assignments: [{ role: "Admin", legalEntityIds: null, departments: null }], actualRoles: ["Admin"], managedProjects: [], assignedProjects: [], reports: [] } as unknown as Viewer;
const runner = { fn: async (): Promise<unknown> => ({ key: "TH-1" }) };
const registry = createRegistry([{ id: "sample", mcpTools: [{ name: "add_thing", description: "Add.", input: z.object({}), scope: "write", run: () => runner.fn() } as unknown as McpToolDef] }]);

describe("registry.call trace step (052)", () => {
  it.each([
    { name: "ok, step written", run: async () => ({ key: "TH-1" }), fails: false, expect: { resolves: { key: "TH-1" } }, steps: ["ok"] },
    { name: "ok, step write fails", run: async () => ({ key: "TH-2" }), fails: true, expect: { resolves: { key: "TH-2" } }, steps: ["ok"] },
    { name: "tool throws", run: async () => { throw new Error("boom"); }, fails: false, expect: { rejects: "boom" }, steps: ["error"] },
    { name: "tool refuses", run: async () => { throw new ForbiddenError("x", "y"); }, fails: false, expect: { rejects: "forbidden" }, steps: ["denied"] },
    { name: "tool throws, step write fails", run: async () => { throw new Error("boom"); }, fails: true, expect: { rejects: "boom" }, steps: ["error"] },
    { name: "tool refuses, step write fails", run: async () => { throw new ForbiddenError("x", "y"); }, fails: true, expect: { rejects: "forbidden: x on y" }, steps: ["denied"] },
    { name: "scope refused, step write fails", run: async () => ({ key: "never" }), fails: true, scopes: ["read" as const], expect: { rejects: "forbidden: add_thing" }, steps: ["denied"] },
  ])("$name", async (c) => {
    steps.length = 0;
    stepFails = c.fails;
    runner.fn = c.run;
    const call = registry.call(viewer, "add_thing", {}, { source: "chat", ...("scopes" in c ? { scopes: c.scopes } : {}) });
    if ("resolves" in c.expect) await expect(call).resolves.toEqual(c.expect.resolves);
    else await expect(call).rejects.toThrow(c.expect.rejects);
    expect(steps).toEqual(c.steps);
  });
});
