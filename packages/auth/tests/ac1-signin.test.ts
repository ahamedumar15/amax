import { describe, expect, it } from "vitest";
import { gate } from "../src/gate";
import { resolveSecretRef } from "../src/authjs";

const u = (p: string) => new URL(p, "https://amax.example");

describe("AC-1 signed-out visitors are redirected to sign-in", () => {
  it("redirects app screens and remembers the destination", () => {
    expect(gate(u("/"), false)?.href).toBe("https://amax.example/signin");
    expect(gate(u("/hello?x=1"), false)?.href).toBe("https://amax.example/signin?next=%2Fhello%3Fx%3D1");
  });
  it("lets signed-in users and public endpoints through", () => {
    expect(gate(u("/hello"), true)).toBeNull();
    for (const p of ["/signin", "/api/auth/callback/entra-x", "/healthz", "/api/jobs/tick", "/api/scim/v2/Users"]) expect(gate(u(p), false)).toBeNull();
    expect(gate(u("/signinx"), false)).not.toBeNull();
  });
});

describe("identity provider secrets are references", () => {
  it("resolves env: references and fails loudly when missing", () => {
    expect(resolveSecretRef("env:ENTRA_SECRET", { ENTRA_SECRET: "s" })).toBe("s");
    expect(() => resolveSecretRef("env:MISSING", {})).toThrow(/env:MISSING is not set/);
    expect(() => resolveSecretRef("plain-secret", { "plain-secret": "x" })).toThrow();
  });
});
