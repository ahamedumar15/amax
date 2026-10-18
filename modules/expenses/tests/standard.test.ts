import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { hasDb, repoRoot } from "@amax/db/testdb";
import { discoverModules } from "@amax/core/registry";
import { installedModules } from "./installed";
import { expensesDb } from "./db";

const files = (dir: string): string[] => readdirSync(dir, { withFileTypes: true }).flatMap((d) => d.isDirectory() ? (d.name === "node_modules" ? [] : files(join(dir, d.name))) : /\.tsx?$/.test(d.name) ? [join(dir, d.name)] : []);

describe("AC-3 module standard", () => {
  it("AC3 can be switched off: nothing outside modules/expenses imports it, and the others load without it", async () => {
    expect(discoverModules(join(repoRoot, "modules"), ["expenses"])).not.toContain("expenses");
    const outside = [...readdirSync(join(repoRoot, "modules")).filter((m) => m !== "expenses").map((m) => join(repoRoot, "modules", m)), join(repoRoot, "packages"), join(repoRoot, "apps/web/app")].flatMap(files);
    expect(outside.filter((f) => /@amax\/expenses(?!\/contracts")/.test(readFileSync(f, "utf8")))).toEqual([]);
    expect((await installedModules(["expenses"])).map((m) => m.id)).not.toContain("expenses");
  }, 60_000);
});

describe.skipIf(!hasDb)("without payroll (Postgres)", () => {
  let db: Awaited<ReturnType<typeof expensesDb>>;
  beforeAll(async () => { db = await expensesDb(["payroll"]); }, 240_000);
  afterAll(() => db?.t.drop());

  it("AC3 without payroll installed Finance's approval pays by bank, and payroll is refused", async () => {
    expect(db.modules.map((m) => m.id)).not.toContain("payroll");
    const [c] = await db.q(sql`select id from expenses.claim where number = 'EXP-0104'`);
    await expect(db.call("sahan", "approve_expense", { claimId: c.id, payVia: "payroll" })).rejects.toThrow(/pay this claim by bank/);
    expect(await db.call("sahan", "approve_expense", { claimId: c.id })).toMatchObject({ status: "approved", payVia: "bank", payrollPeriod: null });
  }, 60_000);
});
