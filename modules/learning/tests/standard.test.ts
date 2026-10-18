import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { repoRoot } from "@amax/db/testdb";
import { discoverModules } from "@amax/core/registry";
import { installedModules } from "./installed";

describe("AC-3 module standard", () => {
  it("AC3 can be switched off: nothing outside modules/learning imports it, and the others load without it", async () => {
    expect(discoverModules(join(repoRoot, "modules"), ["learning"])).not.toContain("learning");
    const files = (dir: string): string[] => readdirSync(dir, { withFileTypes: true }).flatMap((d) => d.isDirectory() ? (d.name === "node_modules" ? [] : files(join(dir, d.name))) : /\.tsx?$/.test(d.name) ? [join(dir, d.name)] : []);
    const outside = [...readdirSync(join(repoRoot, "modules")).filter((m) => m !== "learning").map((m) => join(repoRoot, "modules", m)), join(repoRoot, "packages"), join(repoRoot, "apps/web/app")].flatMap(files);
    // Other modules may integrate through the contract (036 reads training evidence there), never the internals.
    expect(outside.filter((f) => /@amax\/learning(?!\/contracts")/.test(readFileSync(f, "utf8")))).toEqual([]);
    expect((await installedModules(["learning"])).map((m) => m.id)).not.toContain("learning");
  }, 60_000);
});
