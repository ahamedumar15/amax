import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { hasDb, repoRoot } from "@amax/db/testdb";
import { discoverModules } from "@amax/core/registry";
import type { Financials } from "../server/view";
import { installedModules } from "./installed";
import { financeDb } from "./db";

const files = (dir: string): string[] => readdirSync(dir, { withFileTypes: true }).flatMap((d) => d.isDirectory() ? (d.name === "node_modules" ? [] : files(join(dir, d.name))) : /\.tsx?$/.test(d.name) ? [join(dir, d.name)] : []);

describe("AC-4 module standard", () => {
  it("AC4 can be switched off: nothing outside modules/finance imports it, and the others load without it", async () => {
    expect(discoverModules(join(repoRoot, "modules"), ["finance"])).not.toContain("finance");
    const outside = [...readdirSync(join(repoRoot, "modules")).filter((m) => m !== "finance").map((m) => join(repoRoot, "modules", m)), join(repoRoot, "packages"), join(repoRoot, "apps/web/app")].flatMap(files);
    expect(outside.filter((f) => /@amax\/finance(?!\/contracts")/.test(readFileSync(f, "utf8")))).toEqual([]);
    expect((await installedModules(["finance"])).map((m) => m.id)).not.toContain("finance");
  }, 60_000);
});

describe.skipIf(!hasDb)("without time (Postgres)", () => {
  let db: Awaited<ReturnType<typeof financeDb>>;
  beforeAll(async () => { db = await financeDb(["time"]); await db.tick(); }, 240_000);
  afterAll(() => db?.t.drop());

  it("AC4 without time installed the financials still add up, and the T&M contract keeps its recorded hours", async () => {
    expect(db.modules.map((m) => m.id)).not.toContain("time");
    const f = (await db.registry.call(await db.as("maya", "Finance"), "get_financials", {}, { source: "mcp" })) as Financials;
    expect([f.contractValue, f.invoiced, f.contracts[1].next]).toEqual(["774000.00", "418200.00", "$14,200 of October hours to date, not yet invoiced"]);
  }, 60_000);
});
