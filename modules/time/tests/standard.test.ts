import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { withTenant } from "@amax/db";
import { hasDb, repoRoot } from "@amax/db/testdb";
import { discoverModules } from "@amax/core/registry";
import { projectHours, weekTotals } from "../contracts";
import { teamWeek } from "../server/team";
import { T, timeDb } from "./db";

const W = { year: 2026, week: 42 };

describe("module standard", () => {
  it("AC5 can be switched off: nothing outside modules/time imports it", () => {
    expect(discoverModules(join(repoRoot, "modules"), ["time"])).not.toContain("time");
    const others = readdirSync(join(repoRoot, "modules")).filter((m) => m !== "time");
    const files = (dir: string): string[] => readdirSync(dir, { withFileTypes: true }).flatMap((d) => d.isDirectory() ? (d.name === "node_modules" ? [] : files(join(dir, d.name))) : /\.tsx?$/.test(d.name) ? [join(dir, d.name)] : []);
    // Other modules may integrate through the contract (014 payroll reads it there), never the internals.
    expect(others.flatMap((m) => files(join(repoRoot, "modules", m))).filter((f) => /@amax\/time(?!\/contracts")/.test(readFileSync(f, "utf8")))).toEqual([]);
  });
});

describe.skipIf(!hasDb)("contracts and optional hr (Postgres)", () => {
  let db: Awaited<ReturnType<typeof timeDb>>;
  beforeAll(async () => { db = await timeDb(); }, 60_000);
  afterAll(() => db?.t.drop());

  it("AC5 contract reads return the fixture week, and without hr the project chain still routes approvals", async () => {
    const admin = await db.as("maya");
    const totals = await withTenant(db.app, T, (tx) => weekTotals(tx, admin, W));
    expect(totals.map((p) => [p.personName, p.hours, p.status])).toContainEqual(["Kasun Dias", 32.5, "submitted"]);
    expect(totals.reduce((n, p) => n + p.agentHours, 0)).toBeCloseTo(90.2, 5);
    const byProject = await withTenant(db.app, T, (tx) => projectHours(tx, admin, { from: "2026-10-12", to: "2026-10-16" }));
    expect(byProject.map((p) => p.hours)).toEqual([68, 51.5, 22]);
    expect(await withTenant(db.app, T, (tx) => projectHours(tx, admin, { from: "2026-10-12", to: "2026-10-16", approvedOnly: true }))).toEqual([]);
    const ayesha = await db.as("ayesha");
    expect(ayesha.reports).toEqual([]);
    expect((await teamWeek(ayesha, W)).rows.map((r) => r.personName)).toEqual(["Dinesh Wickrama"]);
    const nimal = await db.as("nimal");
    expect((await teamWeek(nimal, W)).rows.map((r) => r.personName)).toEqual(["Kasun Dias", "Tharushi Wijesinghe", "Dinesh Wickrama"]);
    expect((await teamWeek(await db.as("liam"), W)).rows).toEqual([]);
  });
});
