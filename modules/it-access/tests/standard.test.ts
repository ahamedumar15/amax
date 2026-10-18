import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { hasDb, repoRoot } from "@amax/db/testdb";
import { discoverModules } from "@amax/core/registry";
import { accessDb } from "./db";
import { installedModules } from "./installed";

const files = (dir: string): string[] => readdirSync(dir, { withFileTypes: true }).flatMap((d) => d.isDirectory() ? (d.name === "node_modules" ? [] : files(join(dir, d.name))) : /\.tsx?$/.test(d.name) ? [join(dir, d.name)] : []);

describe("AC-4 module standard", () => {
  it("AC4 can be switched off: nothing outside modules/it-access imports it, the others load without it, and its tables are kept per 032", async () => {
    expect(discoverModules(join(repoRoot, "modules"), ["it-access"])).not.toContain("it-access");
    const outside = [...readdirSync(join(repoRoot, "modules")).filter((m) => m !== "it-access").map((m) => join(repoRoot, "modules", m)), join(repoRoot, "packages"), join(repoRoot, "apps/web/app")].flatMap(files);
    expect(outside.filter((f) => /@amax\/it-access(?!\/contracts")/.test(readFileSync(f, "utf8")))).toEqual([]);
    expect((await installedModules(["it-access"])).map((m) => m.id)).not.toContain("it-access");
    const manifest = (await installedModules()).find((m) => m.id === "it-access")!;
    expect(manifest.retention!.map((r) => r.table)).toEqual(["it_access.account", "it_access.seat", "it_access.change", "it_access.sync_run", "it_access.write_consent"]);
  }, 60_000);

  it.skipIf(!hasDb)("AC4 without onboarding installed, a leaver from hr still gets the revoke suggestion", async () => {
    const db = await accessDb(["onboarding"]);
    try {
      expect(db.modules.map((m) => m.id)).not.toContain("onboarding");
      await db.registry.call(await db.as("maya"), "record_leaver", { employeeNo: "LL-0417", leftOn: new Date(Date.now() + 5 * 86_400_000).toISOString().slice(0, 10) }, { source: "mcp" });
      await db.tick();
      expect(await db.q(sql`select target_label from agents.suggestion where kind = 'it-access.revoke'`)).toEqual([{ target_label: "Kasun Dias" }]);
    } finally {
      await db.t.drop();
    }
  }, 240_000);
});
