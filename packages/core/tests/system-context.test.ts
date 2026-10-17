import { describe, expect, it } from "vitest";
import { contextFor, isSystemContext, type ServiceContext } from "../src/server";

const T = "11111111-1111-4111-8111-111111111111";

// Trust in system code comes from core issuing the context, never from a field anyone can set.
describe("isSystemContext", () => {
  it.each([
    { name: "a job context core issued", ctx: () => contextFor.job(T, "core.test"), ok: true },
    { name: "a hand-built system literal", ctx: (): ServiceContext => ({ tenantId: T, actor: { id: "job:core.test", kind: "system" }, source: "job" }), ok: false },
    { name: "a copy of an issued context", ctx: (): ServiceContext => ({ ...contextFor.job(T, "core.test") }), ok: false },
    { name: "a ui context", ctx: () => contextFor.ui(T, { id: "user:maya" }), ok: false },
  ])("$name: $ok", ({ ctx, ok }) => expect(isSystemContext(ctx())).toBe(ok));

  it.each([
    ["tenantId", (c: ServiceContext) => { (c as { tenantId: string }).tenantId = "other"; }],
    ["actor", (c: ServiceContext) => { (c as { actor: unknown }).actor = { id: "user:x", kind: "user" }; }],
    ["actor.id", (c: ServiceContext) => { (c.actor as { id: string }).id = "job:forged"; }],
  ] as const)("an issued context can't be changed after issue: %s", (_, change) => {
    const ctx = contextFor.job(T, "core.test");
    expect(() => change(ctx)).toThrow(TypeError);
    expect(ctx).toMatchObject({ tenantId: T, actor: { id: "job:core.test", kind: "system" } });
  });
});
