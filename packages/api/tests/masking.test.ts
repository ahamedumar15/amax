import { describe, expect, it } from "vitest";
import { declaredFieldClasses } from "@amax/core/server";
import { maskPayload } from "../src";

// Review 058 B4: outgoing payloads are masked by the classes the modules declare (retention entries,
// tools' classified results), in any spelling of the field, not by a second list of name guesses.
const declared = declaredFieldClasses([
  { retention: [
    { table: "x.employment", fields: ["epf_number", "base_salary"], class: "pay", period: "P7Y", start: { at: ["ends_on"] }, action: "anonymise" },
    { table: "x.employment", fields: ["bank_account"], class: "bank", period: "P7Y", start: { at: ["ends_on"] }, action: "anonymise" },
    { table: "x.person", fields: ["name"], class: "personal", period: "P7Y", start: { at: ["left_on"] }, action: "anonymise" },
  ] },
  { mcpTools: [{ name: "get_x", description: "", input: undefined as never, permission: "", scope: "read", run: async () => null, sensitive: { probationOutcome: "performance" } }] },
]);

describe("058 outgoing webhook masking follows the declared classes", () => {
  it.each([
    ["epf_number", "pay"], ["epfNumber", "pay"], ["EPF-Number", "pay"], ["base_salary", "pay"], ["baseSalary", "pay"],
    ["bank_account", "bank"], ["bankAccount", "bank"], ["probation_outcome", "performance"], ["probationOutcome", "performance"],
  ])("masks %s as %s", (field, cls) => {
    expect(maskPayload({ person: { [field]: "value", name: "Test Person" } }, declared)).toEqual({ person: { [field]: { masked: true, class: cls }, name: "Test Person" } });
  });

  it("leaves unclassified fields and the personal class (not a 002 class) as they are", () => {
    expect(declared).not.toHaveProperty("name");
    expect(maskPayload({ name: "Test Person", leftOn: "2026-10-01" }, declared)).toEqual({ name: "Test Person", leftOn: "2026-10-01" });
  });
});
