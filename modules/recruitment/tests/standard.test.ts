import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { repoRoot } from "@amax/db/testdb";
import { discoverModules } from "@amax/core/registry";
import { installedModules } from "./installed";

const files = (dir: string): string[] => readdirSync(dir, { withFileTypes: true }).flatMap((d) => d.isDirectory() ? (d.name === "node_modules" ? [] : files(join(dir, d.name))) : /\.tsx?$/.test(d.name) ? [join(dir, d.name)] : []);

describe("AC-4 module standard", () => {
  it("AC4 can be switched off: nothing outside modules/recruitment imports it, the others load without it, and candidates are kept per 032", async () => {
    expect(discoverModules(join(repoRoot, "modules"), ["recruitment"])).not.toContain("recruitment");
    const outside = [...readdirSync(join(repoRoot, "modules")).filter((m) => m !== "recruitment").map((m) => join(repoRoot, "modules", m)), join(repoRoot, "packages"), join(repoRoot, "apps/web/app")].flatMap(files);
    expect(outside.filter((f) => /@amax\/recruitment(?!\/contracts")/.test(readFileSync(f, "utf8")))).toEqual([]);
    expect((await installedModules(["recruitment"])).map((m) => m.id)).not.toContain("recruitment");
    const manifest = (await installedModules()).find((m) => m.id === "recruitment")!;
    expect(manifest.retention!.find((r) => r.table === "recruitment.candidate")).toMatchObject({ class: "candidate", period: "P12M", start: { at: ["decided_at"] } });
  }, 60_000);
});
