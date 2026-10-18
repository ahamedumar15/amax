import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { sql } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { hasDb, repoRoot } from "@amax/db/testdb";
import { discoverModules } from "@amax/core/registry";
import manifest from "../module";
import { experienceView } from "../server/views";
import { experienceDb } from "./db";
import { installedModules } from "./installed";

const files = (dir: string): string[] => readdirSync(dir, { withFileTypes: true }).flatMap((d) => d.isDirectory() ? (d.name === "node_modules" ? [] : files(join(dir, d.name))) : /\.tsx?$/.test(d.name) ? [join(dir, d.name)] : []);

describe("AC-8 module standard", () => {
  it("AC8 can be switched off, imports only shared packages and contracts, has a retention rule for every personal table, and replaces its Coming soon entry", async () => {
    expect(discoverModules(join(repoRoot, "modules"), ["experience"])).not.toContain("experience");
    expect((await installedModules(["experience"])).map((m) => m.id)).not.toContain("experience");
    const outside = [...readdirSync(join(repoRoot, "modules")).filter((m) => m !== "experience").map((m) => join(repoRoot, "modules", m)), join(repoRoot, "packages"), join(repoRoot, "apps/web/app")].flatMap(files);
    expect(outside.filter((f) => /@amax\/experience(?!\/contracts")/.test(readFileSync(f, "utf8")))).toEqual([]);
    const mine = files(join(repoRoot, "modules/experience"));
    expect(mine.filter((f) => /from "@amax\/(?!core|db|auth|ui|mcp|chat|agents|workflows|ai|api\/egress|testing|[a-z-]+\/contracts")/.test(readFileSync(f, "utf8")))).toEqual([]);
    expect(manifest.retention!.map((r) => r.table)).toEqual(["experience.device", "experience.device_day", "experience.device_app_day", "experience.collection", "experience.settings", "experience.remediation", "experience.pulse"]);
    expect(readFileSync(join(repoRoot, "apps/web/lib/operations.ts"), "utf8")).toContain(`slug: "${manifest.id}"`);
  }, 60_000);
});

describe.skipIf(!hasDb)("without helpdesk, notifications and insights (Postgres)", () => {
  let db: Awaited<ReturnType<typeof experienceDb>> | undefined;
  afterAll(() => db?.t.drop());

  it("AC8 the screen loads with no ticket route, a pulse still goes out, and the jobs run", async () => {
    db = await experienceDb(["helpdesk", "notifications", "insights"]);
    expect(db.modules.filter((m) => ["helpdesk", "notifications", "insights"].includes(m.id))).toEqual([]);
    const v = await experienceView(await db.as("maya"));
    expect([v.all.score, v.helpdesk, v.fixes.length]).toEqual([7.9, false, 0]);
    await db.tick();
    expect((await experienceView(await db.as("maya"))).fixes.map((f) => f.status)).toEqual(["open", "open"]);
    await db.q(sql`update experience.settings set today = '2026-10-28'`);
    expect(await db.registry.call(await db.as("maya"), "send_pulse", {}, { source: "mcp" })).toMatchObject({ recipients: expect.any(Number) });
  }, 240_000);
});
