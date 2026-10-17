import { readFileSync } from "node:fs";
import { join } from "node:path";
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { withTenant, type Db } from "@amax/db";
import type { FixtureSeed } from "@amax/core";
import { checkTotals, hasDb, loadFixtures, lumen, migratedDatabase, repoRoot, totals } from "../src";
import { discoverModules } from "@amax/core/registry";

const sheet = readFileSync(join(repoRoot, ".specclaw/changes/archive/001-amax-foundation/fixtures.md"), "utf8");

describe("AC-6 shared fixtures match fixtures.md", () => {
  it("names every person and project the sheet names", () => {
    for (const p of lumen.people) expect(sheet, p.name).toContain(p.name);
    for (const p of lumen.projects) expect(sheet, p.name).toContain(p.name);
    for (const e of lumen.entities) expect(sheet).toContain(`**${e.name}** (${e.country === "LK" ? "Sri Lanka" : "Australia"}, ${e.baseCurrency}, ${e.headcount} people)`);
  });

  it("every total whose modules are installed checks out; the rest are pending", () => {
    const installed = discoverModules(join(repoRoot, "modules"));
    const { failures, pending } = checkTotals(lumen, installed);
    expect(failures).toEqual([]);
    expect(pending.length + totals.filter((c) => c.modules.every((m) => installed.includes(m))).length).toBe(totals.length);
  });

  it("a check waits for its modules", () => {
    const checks = [{ name: "team time 141.5 h", modules: ["time"], expected: 141.5, actual: () => 0 }];
    expect(checkTotals(lumen, [], checks)).toEqual({ pending: ["team time 141.5 h"], failures: [] });
    expect(checkTotals(lumen, ["time"], checks).failures).toHaveLength(1);
  });
});

describe.skipIf(!hasDb)("AC-6 loadFixtures (Postgres)", () => {
  let t: Awaited<ReturnType<typeof migratedDatabase>>;
  let app: Db;
  const order: string[] = [];
  const seed = (id: string): FixtureSeed => async ({ tx, tenantId, shared }) => {
    order.push(id);
    expect(tenantId).toBe(shared.tenant.id);
    const [{ n }] = await tx.execute(sql`select count(*)::int as n from core.legal_entity`);
    expect(n).toBe(2);
  };

  beforeAll(async () => {
    t = await migratedDatabase();
    app = t.app();
  });
  afterAll(() => t?.drop());

  it("seeds the tenant and entities as the app role, then modules in dependency order, and can re-run", async () => {
    const modules = [
      { id: "time", dependsOn: ["delivery", "hr"], fixtures: [seed("time")] },
      { id: "hr", dependsOn: [], fixtures: [seed("hr")] },
      { id: "delivery", dependsOn: ["hr"], fixtures: [seed("delivery")] },
    ];
    await loadFixtures(app, modules);
    expect(order).toEqual(["hr", "delivery", "time"]);
    await loadFixtures(app, []);
    const rows = await withTenant(app, lumen.tenant.id, (tx) => tx.execute(sql`select country, base_currency from core.legal_entity order by country`));
    expect(rows).toEqual([{ country: "AU", base_currency: "AUD" }, { country: "LK", base_currency: "LKR" }]);
  });
});
