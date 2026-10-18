import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { hasDb, repoRoot } from "@amax/db/testdb";
import { discoverModules } from "@amax/core/registry";
import manifest from "../module";
import { installedRoutes } from "../routes";
import { inboxOverview } from "../server/views";
import { inboxDb } from "./db";
import { installedModules } from "./installed";

const files = (dir: string): string[] => readdirSync(dir, { withFileTypes: true }).flatMap((d) => d.isDirectory() ? (d.name === "node_modules" ? [] : files(join(dir, d.name))) : /\.tsx?$/.test(d.name) ? [join(dir, d.name)] : []);

describe("AC-4 module standard", () => {
  it("AC4 AC5 can be switched off, imports no other module, and deletes excerpts 30 days after a find closes or expires", async () => {
    expect(discoverModules(join(repoRoot, "modules"), ["inbox-agent"])).not.toContain("inbox-agent");
    const outside = [...readdirSync(join(repoRoot, "modules")).filter((m) => m !== "inbox-agent").map((m) => join(repoRoot, "modules", m)), join(repoRoot, "packages"), join(repoRoot, "apps/web/app")].flatMap(files);
    expect(outside.filter((f) => readFileSync(f, "utf8").includes("@amax/inbox-agent"))).toEqual([]);
    expect(files(join(repoRoot, "modules/inbox-agent")).filter((f) => /from "@amax\/(?!core|db|auth|ui|mcp|chat|agents|workflows|ai|api|testing)/.test(readFileSync(f, "utf8")))).toEqual([]);
    expect((await installedModules(["inbox-agent"])).map((m) => m.id)).not.toContain("inbox-agent");
    expect(manifest.retention!.find((r) => r.table === "inbox_agent.find")).toMatchObject({ period: "P30D", start: { at: ["closed_at", "expires_at"] }, action: "delete", fields: ["excerpt", "link", "fields", "acts_for"] });
  }, 60_000);
});

describe.skipIf(!hasDb)("without the modules that own record types (Postgres)", () => {
  let db: Awaited<ReturnType<typeof inboxDb>> | undefined;
  afterAll(() => db?.t.drop());

  it("AC4 with presales and leave switched off, their record types are never offered or shown, and the screen still loads", async () => {
    const others = discoverModules(join(repoRoot, "modules")).filter((m) => !["inbox-agent", "hr", "delivery"].includes(m));
    db = await inboxDb(others);
    await db.tick();
    expect(db.modules.map((m) => m.id).sort()).toEqual(["delivery", "hr", "inbox-agent"]);
    expect(await db.tx((tx) => installedRoutes(tx))).toEqual([]);
    const o = await inboxOverview(await db.as("maya"));
    expect([o.finds, o.sources.length, o.consent?.granted]).toEqual([[], 10, true]);
  }, 240_000);
});
