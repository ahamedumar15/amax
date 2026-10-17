import { describe, expect, it } from "vitest";
import { contextFor, isSystemContext, type ServiceContext } from "../src/server";

const T = "11111111-1111-4111-8111-111111111111";

// Trust in system code comes from core issuing the context, never from a field anyone can set.
describe("isSystemContext", () => {
  it.each([
    { name: "a job context core issued", ctx: () => contextFor.job(T, "core.test"), ok: true },
    { name: "a hand-built system literal", ctx: (): ServiceContext => ({ tenantId: T, actor: { id: "job:core.test", kind: "system" }, source: "job" }), ok: false },
    { name: "a copy of an issued context", ctx: (): ServiceContext => ({ ...contextFor.job(T, "core.test") }), ok: false },
    { name: "an issued context whose actor was changed", ctx: () => Object.assign(contextFor.job(T, "core.test"), { actor: { id: "user:x", kind: "user" as const } }), ok: false },
    { name: "a ui context", ctx: () => contextFor.ui(T, { id: "user:maya" }), ok: false },
  ])("$name: $ok", ({ ctx, ok }) => expect(isSystemContext(ctx())).toBe(ok));
});
