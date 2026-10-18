import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { hasDb, repoRoot } from "@amax/db/testdb";
import { discoverModules } from "@amax/core/registry";
import manifest from "../module";
import { matchSkills } from "../server/match";
import { scanRisks } from "../server/risk";
import type { Insights } from "../server/views";
import { sharedDb, T } from "./db";
import { installedModules } from "./installed";

const files = (dir: string): string[] => readdirSync(dir, { withFileTypes: true }).flatMap((d) => d.isDirectory() ? (d.name === "node_modules" ? [] : files(join(dir, d.name))) : /\.tsx?$/.test(d.name) ? [join(dir, d.name)] : []);
const OPTIONAL = ["allocations", "leave", "payroll", "finance", "it-access", "recruitment", "learning", "reports"];

describe("AC-4 module standard", () => {
  it("AC4 can be switched off, imports other modules only through contracts, and keeps insights two years", async () => {
    expect(discoverModules(join(repoRoot, "modules"), ["insights"])).not.toContain("insights");
    const outside = [...readdirSync(join(repoRoot, "modules")).filter((m) => m !== "insights").map((m) => join(repoRoot, "modules", m)), join(repoRoot, "packages"), join(repoRoot, "apps/web/app")].flatMap(files);
    expect(outside.filter((f) => /@amax\/insights(?!\/contracts")/.test(readFileSync(f, "utf8")))).toEqual([]);
    expect(files(join(repoRoot, "modules/insights")).filter((f) => /from "@amax\/(?!core|db|auth|ui|mcp|chat|agents|workflows|ai|testing)[\w-]+\/(?!contracts")/.test(readFileSync(f, "utf8")))).toEqual([]);
    expect((await installedModules(["insights"])).map((m) => m.id)).not.toContain("insights");
    expect(manifest.retention).toEqual([expect.objectContaining({ table: "insights.insight", period: "P2Y", start: { at: ["as_of"] }, action: "delete" })]);
  }, 60_000);
});

describe.skipIf(!hasDb)("without the optional modules (Postgres)", () => {
  const use = sharedDb(OPTIONAL);

  it("AC2 AC4 the screen still reads, with the figures of missing modules left out and said so, and the agents skip what they can't read", async () => {
    const db = use();
    expect(db.modules.map((m) => m.id)).not.toContain("learning");
    const r = await db.call<Insights>("maya", "get_insights", {});
    expect(r.notes).toEqual(["Learning isn't installed, so certifications aren't counted."]);
    expect([r.talent.certifications, r.market.utilisation, r.talent.headcount.value.now, r.briefing.length]).toEqual([null, null, 184, 3]);
    expect(await scanRisks(T)).toEqual({ summary: "No new risks" });
    expect(await matchSkills(T)).toEqual({ summary: "Skipped: no allocations to match" });
  }, 240_000);
});
