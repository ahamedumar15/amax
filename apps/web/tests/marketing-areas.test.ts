import { describe, expect, it } from "vitest";
import { modules } from "../generated/modules";
import { AREAS, isPlatform } from "../components/marketing/areas";

describe("062 AC-3 every live claim on the marketing page is a shipped module", () => {
  const installed = new Set(modules.map((m) => m.id));
  const claims = AREAS.flatMap((a) => a.live.filter((c) => !isPlatform(c)).map((c) => [a.title, c.text, c.module ?? ""] as const));
  it.each(claims)("%s: %s comes from module %s", (_area, _text, id) => {
    expect(installed.has(id)).toBe(true);
  });
  it("names no unshipped module as live and marks planned work Coming", () => {
    for (const planned of ["payroll", "contracts", "expenses", "it-access", "helpdesk", "insights", "onboarding"]) expect(installed.has(planned)).toBe(false);
    expect(AREAS.flatMap((a) => a.coming)).toEqual(expect.arrayContaining(["Payroll for Sri Lanka and Australia", "Contracts and billing", "IT assets and access"]));
  });
});
