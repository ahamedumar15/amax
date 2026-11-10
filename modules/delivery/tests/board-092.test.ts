import { describe, expect, it } from "vitest";
import { releasedLabel } from "../ui/released";

// 092 AC-5: "In Prod" only for what a Prod deployment released.
describe("092 the Released card's label", () => {
  it.each([
    ["released by a Prod deployment", { release: "v2.4.0" }, { text: "In Prod · v2.4.0", prod: true }],
    ["brought in from the repo's archive", { release: null }, { text: "Released · from repo", prod: false }],
  ])("AC-5 %s", (_, p, label) => {
    expect(releasedLabel(p)).toEqual(label);
  });
});
