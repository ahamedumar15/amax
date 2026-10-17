import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { withTenant, type Db } from "@amax/db";
import { hasDb, migratedDatabase } from "@amax/db/testdb";
import { lumen } from "@amax/testing";
import { installedSeeds, seedInstalledModules } from "../scripts/seed-demo";
import { modules } from "../generated/modules";

// The demo seed loads every installed module's fixtures, and re-running it adds no rows.
const COUNTED = ["auth.user", "hr.person", "hr.employment", "delivery.project", "allocations.allocation", "allocations.member"];

describe("demo seed", () => {
  it("seeds auth first, then every module in the registry", async () => {
    const seeds = await installedSeeds();
    expect(seeds.map((s) => s.id)).toEqual(["auth", ...modules.map((m) => m.id)]);
    expect(seeds.slice(1).every((s) => s.dependsOn.includes("auth"))).toBe(true);
  });
});

describe.skipIf(!hasDb)("demo seed (Postgres)", () => {
  let t: Awaited<ReturnType<typeof migratedDatabase>>;
  let db: Db;
  const counts = () => withTenant(db, lumen.tenant.id, async (tx) =>
    Object.fromEntries(await Promise.all(COUNTED.map(async (table) => [table, Number((await tx.execute(sql.raw(`select count(*)::int as n from ${table}`)))[0].n)]))));
  beforeAll(async () => { t = await migratedDatabase(); db = t.app(); }, 60_000);
  afterAll(() => t?.drop());

  it("fills hr and allocations as well as delivery, and a second run adds nothing", async () => {
    const r = await seedInstalledModules(db);
    expect(r.modules).toEqual(expect.arrayContaining(["auth", "delivery", "hr", "allocations"]));
    const first = await counts();
    const [active] = await withTenant(db, lumen.tenant.id, (tx) => tx.execute(sql`select count(*)::int as n from hr.person where status = 'active'`));
    expect(Number(active.n)).toBe(184);
    for (const table of COUNTED) expect(first[table], table).toBeGreaterThan(0);
    await seedInstalledModules(db);
    expect(await counts()).toEqual(first);
  }, 120_000);

  it("seeds a deployed demo's own sign-in tenant (not the fixtures' id) the same way", async () => {
    const t2 = await migratedDatabase();
    try {
      const db2 = t2.app();
      const other = { id: "22222222-2222-4222-8222-222222222222", name: "Demo tenant" };
      await withTenant(db2, other.id, (tx) => tx.execute(sql`insert into core.tenant (id, name) values (${other.id}, ${other.name})`));
      await seedInstalledModules(db2, other);
      await seedInstalledModules(db2, other);
      const [p] = await withTenant(db2, other.id, (tx) => tx.execute(sql`select count(*)::int as n from hr.person where status = 'active'`));
      const [lumenRows] = await withTenant(db2, lumen.tenant.id, (tx) => tx.execute(sql`select count(*)::int as n from hr.person`));
      expect([Number(p.n), Number(lumenRows.n)]).toEqual([184, 0]);
    } finally {
      await t2.drop();
    }
  }, 120_000);
});
