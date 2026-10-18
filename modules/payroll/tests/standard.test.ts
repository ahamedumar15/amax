import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { hasDb, repoRoot } from "@amax/db/testdb";
import { discoverModules } from "@amax/core/registry";
import { getRun } from "../server/queries";
import { installedModules } from "./installed";
import { payrollDb } from "./db";

const files = (dir: string): string[] => readdirSync(dir, { withFileTypes: true }).flatMap((d) => d.isDirectory() ? (d.name === "node_modules" ? [] : files(join(dir, d.name))) : /\.tsx?$/.test(d.name) ? [join(dir, d.name)] : []);

describe("AC-5 module standard", () => {
  it("AC5 can be switched off: nothing outside modules/payroll imports it, and the others load without it", async () => {
    expect(discoverModules(join(repoRoot, "modules"), ["payroll"])).not.toContain("payroll");
    const outside = [...readdirSync(join(repoRoot, "modules")).filter((m) => m !== "payroll").map((m) => join(repoRoot, "modules", m)), join(repoRoot, "packages"), join(repoRoot, "apps/web/app")].flatMap(files);
    expect(outside.filter((f) => /@amax\/payroll(?!\/contracts")/.test(readFileSync(f, "utf8")))).toEqual([]);
    expect((await installedModules(["payroll"])).map((m) => m.id)).not.toContain("payroll");
    const manifest = (await installedModules()).find((m) => m.id === "payroll")!;
    expect(manifest.retention!.filter((r) => r.class === "pay").every((r) => r.entity === "legal_entity_id" && r.period === "P7Y")).toBe(true);
  }, 60_000);
});

describe.skipIf(!hasDb)("without time (Postgres)", () => {
  let db: Awaited<ReturnType<typeof payrollDb>>;
  beforeAll(async () => { db = await payrollDb(["time"]); }, 240_000);
  afterAll(() => db?.t.drop());

  it("AC5 without time installed a run still drafts from hr and leave, and says overtime didn't come from timesheets", async () => {
    expect(db.modules.map((m) => m.id)).not.toContain("time");
    const payroll = await db.as("maya", "Payroll");
    const [group] = await db.q(sql`select id from payroll.pay_group`);
    const r = (await db.registry.call(payroll, "draft_payroll_run", { payGroupId: group.id, period: "2026-11" }, { source: "mcp" })) as { runId: string; payslips: number; sources: { time: string } };
    expect([r.payslips, r.sources.time]).toEqual([8, "Time isn't installed, so no overtime from timesheets"]);
    expect((await getRun(payroll, r.runId))!.money!.totals.people).toBe(8);
  }, 60_000);
});
