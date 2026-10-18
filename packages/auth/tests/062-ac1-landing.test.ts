import { describe, expect, it } from "vitest";
import { gate, isPublicPath, landing } from "../src/gate";

const u = (p: string) => new URL(p, "https://amax.example");

describe("062 AC-1 / AC-2 signed-out visitors at / see the marketing page", () => {
  it("rewrites only a signed-out /, and keeps /welcome public", () => {
    expect(landing(u("/"), false)?.href).toBe("https://amax.example/welcome");
    expect(landing(u("/"), true)).toBeNull();
    expect(landing(u("/time"), false)).toBeNull();
    expect(isPublicPath("/welcome")).toBe(true);
    expect(gate(u("/welcome"), false)).toBeNull();
    expect(isPublicPath("/welcomex")).toBe(false);
  });
});
