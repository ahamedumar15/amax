import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { discoverModules, registrySource } from "@amax/core/registry";

describe("AC2 module discovery", () => {
  it("AC2 a module folder with a manifest is mounted, and removing or disabling it unmounts it", () => {
    const dir = mkdtempSync(join(tmpdir(), "amax-modules-"));
    mkdirSync(join(dir, "hello"));
    writeFileSync(join(dir, "hello", "module.ts"), "export default {}");
    mkdirSync(join(dir, "notes"));
    expect(discoverModules(dir)).toEqual(["hello"]);
    expect(registrySource(discoverModules(dir))).toContain('from "@amax/hello/module"');
    expect(discoverModules(dir, ["hello"])).toEqual([]);
    rmSync(join(dir, "hello"), { recursive: true });
    expect(discoverModules(dir)).toEqual([]);
  });
});
