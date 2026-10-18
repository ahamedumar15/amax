import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { repoRoot } from "@amax/db/testdb";
import { discoverModules } from "@amax/core/registry";
import { installedModules } from "./installed";

describe("AC-4 module standard", () => {
  it("AC4 can be switched off: nothing outside modules/onboarding imports it, and the others load without it", async () => {
    expect(discoverModules(join(repoRoot, "modules"), ["onboarding"])).not.toContain("onboarding");
    const files = (dir: string): string[] => readdirSync(dir, { withFileTypes: true }).flatMap((d) => d.isDirectory() ? (d.name === "node_modules" ? [] : files(join(dir, d.name))) : /\.tsx?$/.test(d.name) ? [join(dir, d.name)] : []);
    const outside = [...readdirSync(join(repoRoot, "modules")).filter((m) => m !== "onboarding").map((m) => join(repoRoot, "modules", m)), join(repoRoot, "packages"), join(repoRoot, "apps/web/app")].flatMap(files);
    // 021 (it-access) may build on the contract's access event; nothing reaches the internals.
    expect(outside.filter((f) => /@amax\/onboarding(?!\/contracts")/.test(readFileSync(f, "utf8")))).toEqual([]);
    expect((await installedModules(["onboarding"])).map((m) => m.id)).not.toContain("onboarding");
  }, 60_000);
});
