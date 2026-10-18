import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { repoRoot } from "@amax/db/testdb";
import { discoverModules } from "@amax/core/registry";
import manifest from "../module";
import { installedModules } from "./installed";

const files = (dir: string): string[] => readdirSync(dir, { withFileTypes: true }).flatMap((d) => d.isDirectory() ? (d.name === "node_modules" ? [] : files(join(dir, d.name))) : /\.tsx?$/.test(d.name) ? [join(dir, d.name)] : []);

describe("AC-4 module standard", () => {
  it("AC4 can be switched off, imports only shared packages and contracts, keeps tickets seven years after closing, and replaces its Coming soon entry", async () => {
    expect(discoverModules(join(repoRoot, "modules"), ["helpdesk"])).not.toContain("helpdesk");
    expect((await installedModules(["helpdesk"])).map((m) => m.id)).not.toContain("helpdesk");
    const outside = [...readdirSync(join(repoRoot, "modules")).filter((m) => m !== "helpdesk").map((m) => join(repoRoot, "modules", m)), join(repoRoot, "packages"), join(repoRoot, "apps/web/app")].flatMap(files);
    expect(outside.filter((f) => /@amax\/helpdesk(?!\/contracts")/.test(readFileSync(f, "utf8")))).toEqual([]);
    const mine = files(join(repoRoot, "modules/helpdesk"));
    expect(mine.filter((f) => /from "@amax\/(?!core|db|auth|ui|mcp|chat|agents|workflows|ai|testing|[a-z-]+\/contracts")/.test(readFileSync(f, "utf8")))).toEqual([]);
    expect(manifest.retention!.map((r) => [r.table, r.period, r.start.at, r.action])).toEqual([["helpdesk.ticket", "P7Y", ["closed_at"], "delete"], ["helpdesk.ticket_event", "P7Y", ["ticket_closed_at"], "delete"]]);
    expect(readFileSync(join(repoRoot, "modules/helpdesk/db/migrations/0001_helpdesk.sql"), "utf8")).toMatch(/ticket_id uuid primary key references helpdesk\.ticket\(id\) on delete cascade/);
    expect(readFileSync(join(repoRoot, "apps/web/lib/operations.ts"), "utf8")).toContain(`slug: "${manifest.id}"`);
  }, 60_000);
});
