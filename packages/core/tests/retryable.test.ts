import { describe, expect, it } from "vitest";
import { z } from "zod";
import { ForbiddenError } from "../src/authorize";
import { retryable } from "../src/idempotency";
import { ValidationError } from "../src/service";

// Review round 8: one classifier for "can a retry fix this?", every variant.
describe("retryable", () => {
  const zodError = z.object({ a: z.string() }).safeParse({}).error;
  it.each([
    ["ForbiddenError", new ForbiddenError("x", "y"), false],
    ["ValidationError", new ValidationError([]), false],
    ["ZodError", zodError, false],
    ["an error carrying code not_found", Object.assign(new Error("gone"), { code: "not_found" }), false],
    ["a Postgres unique violation", Object.assign(new Error("dup"), { code: "23505" }), false],
    ["a ForbiddenError wrapped as cause", new Error("wrapped", { cause: new ForbiddenError("x", "y") }), false],
    ["an explicit retryable: false", Object.assign(new Error("no"), { retryable: false }), false],
    ["a connection reset", Object.assign(new Error("reset"), { code: "ECONNRESET" }), true],
    ["a plain error", new Error("hmm"), true],
    ["a string", "boom", true],
  ])("%s", (_n, e, expected) => expect(retryable(e)).toBe(expected));
});
