import { expect, it } from "vitest";
import type { ModuleManifest } from "@amax/core";
import { groupItems } from "@amax/ui";
import { installed, moduleNav, settingsEntries } from "../lib/registry";

const shuffled = <T>(xs: readonly T[], seed: number) => [...xs].map((x, i) => ({ x, k: Math.sin(seed * 997 + i * 31) })).sort((a, b) => a.k - b.k).map((p) => p.x);

it("AC-1 one heading per group in a fixed order, whatever order the modules are found in", () => {
  const extra = { ...installed[0], id: "zz", title: "Late", nav: [{ path: "ops", title: "Ops screen", icon: "grid", group: "Operations" }] } as ModuleManifest;
  const mods = [...installed, extra];
  const headings = (seed: number) => groupItems(moduleNav(shuffled(mods, seed))).map(([g]) => g);
  for (const seed of [1, 2, 3, 4, 5]) expect(headings(seed)).toEqual(["Work", "People", "Business", "Operations"]);
  expect(moduleNav(shuffled(mods, 7)).map((i) => i.href)).toEqual(moduleNav(mods).map((i) => i.href));
});

it("AC-2 an entry with parent settings is a hub card, not a rail item", () => {
  const status = async () => "2 rules";
  const mod = { ...installed[0], id: "rules", title: "Rules", nav: [{ path: "setup", title: "Rule setup", icon: "gear", parent: "settings", blurb: "How rules run.", status }] } as ModuleManifest;
  expect(moduleNav([mod]).map((i) => i.href)).toEqual(["/rules"]);
  expect(settingsEntries([mod])).toEqual([{ module: "rules", moduleTitle: "Rules", href: "/rules/setup", title: "Rule setup", blurb: "How rules run.", status }]);
});
