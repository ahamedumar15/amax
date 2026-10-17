import { expect, it } from "vitest";
import { navItems } from "../lib/registry";

it("AC5 delivery's nav[] puts Projects, Proposals and Releases first in Work, as in the mock", () => {
  const work = navItems.filter((i) => i.group === "Work");
  expect(work.slice(0, 3).map((i) => [i.label, i.href])).toEqual([["Projects", "/delivery"], ["Proposals", "/delivery/proposals"], ["Releases", "/delivery/releases"]]);
  expect(work.slice(1, 3).some((i) => i.primary)).toBe(false);
  expect(navItems.some((i) => i.href === "/hello")).toBe(false);
});
