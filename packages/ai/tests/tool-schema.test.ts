import { describe, expect, it } from "vitest";
import { z } from "zod";
import { toolInputSchema } from "../src/tool-schema";

const reason = z.string().min(1);
const Hold = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("person"), person: z.string(), reason }),
  z.object({ kind: z.literal("matter"), matter: z.string(), ids: z.array(z.string()).min(1), reason }),
]);

describe("069 tool input schemas the provider accepts", () => {
  it("AC-1 a union input becomes one object schema with merged properties", () => {
    const s = toolInputSchema(Hold);
    expect(s.type).toBe("object");
    expect(s).not.toHaveProperty("oneOf");
    expect(s).not.toHaveProperty("anyOf");
    expect(s).not.toHaveProperty("allOf");
    expect(Object.keys(s.properties).sort()).toEqual(["ids", "kind", "matter", "person", "reason"]);
    expect(s.properties.kind).toMatchObject({ enum: ["person", "matter"] });
    expect(s.required.sort()).toEqual(["kind", "reason"]);
  });

  it("AC-3 zod still rejects an input that matches no branch", () => {
    expect(Hold.safeParse({ kind: "matter", person: "p-1", reason: "audit" }).success).toBe(false);
    expect(Hold.safeParse({ kind: "matter", matter: "M1", ids: ["a"], reason: "audit" }).success).toBe(true);
  });
});
