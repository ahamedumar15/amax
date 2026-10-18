import postgres from "postgres";
import { afterAll, describe, expect, it, vi } from "vitest";
import { adminUrl, hasDb, migrationHash } from "../src/testdb";

type TestDb = typeof import("../src/testdb");
const fresh = async (): Promise<TestDb> => {
  vi.resetModules();
  return import("../src/testdb");
};

describe.skipIf(!hasDb)("061 tests copy one migrated template", () => {
  const admin = hasDb ? postgres(adminUrl!, { max: 1, onnotice: () => {} }) : (null as never);
  const templates = async () => (await admin`select datname from pg_database where datname like 'amax\\_tpl\\_%' and datname not like '%\\_building' order by oid`).map((r) => r.datname as string);
  afterAll(() => admin?.end());

  it("AC1 concurrent callers build one template, named by the migration hash, and a copy has every migration", async () => {
    const [a, b] = await Promise.all([fresh(), fresh()]);
    const [ta, tb] = await Promise.all([a.migratedTemplate(), b.migratedTemplate()]);
    expect(ta).toBe(`amax_tpl_${migrationHash()}`);
    expect(tb).toBe(ta);
    expect((await templates()).filter((t) => t === ta)).toHaveLength(1);
    const copy = await a.migratedDatabase();
    const [{ n }] = await copy.owner`select count(*)::int as n from amax_migrations.applied`;
    expect(n).toBeGreaterThan(30);
    await copy.drop();
  }, 180_000);

  it("AC2 keeps only the newest templates", async () => {
    for (const old of ["amax_tpl_old0000000000a", "amax_tpl_old0000000000b", "amax_tpl_old0000000000c"]) await admin.unsafe(`create database ${old}`);
    const current = await (await fresh()).migratedTemplate();
    const left = await templates();
    expect(left).toContain(current);
    expect(left.length).toBeLessThanOrEqual(3);
    expect(left).not.toContain("amax_tpl_old0000000000a");
  }, 180_000);
});
