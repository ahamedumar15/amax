import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { withTenant, type Db } from "@amax/db";
import { hasDb, migratedDatabase, tablesMissingRls } from "../src";

const A = "00000000-0000-4000-8000-00000000000a";
const B = "00000000-0000-4000-8000-00000000000b";

// Drizzle wraps driver errors; the Postgres message is on the cause.
const pgError = (p: Promise<unknown>) => p.then(() => "", (e) => String(e?.cause?.message ?? e?.message));

describe.skipIf(!hasDb)("AC-2 tenant isolation", () => {
  let t: Awaited<ReturnType<typeof migratedDatabase>>;
  let app: Db;

  beforeAll(async () => {
    t = await migratedDatabase();
    await t.owner`insert into core.tenant (id, name) values (${A}, 'A'), (${B}, 'B')`;
    app = t.app();
    await withTenant(app, A, (tx) => tx.execute(sql`insert into core.legal_entity (tenant_id, name, country, base_currency) values (${A}, 'A Lanka', 'LK', 'LKR')`));
  });
  afterAll(() => t?.drop());

  it("every table with tenant_id has RLS enabled, forced and a policy", async () => {
    expect(await tablesMissingRls(t.owner)).toEqual([]);
  });

  it("the app role owns nothing and can't bypass RLS", async () => {
    const [r] = await t.owner`select rolsuper, rolbypassrls from pg_roles where rolname = 'amax_app'`;
    expect(r).toEqual({ rolsuper: false, rolbypassrls: false });
    const [{ n }] = await t.owner`select count(*)::int as n from pg_tables where tableowner = 'amax_app'`;
    expect(n).toBe(0);
  });

  it("tenant A sees its own row", async () => {
    const rows = await withTenant(app, A, (tx) => tx.execute(sql`select name from core.legal_entity`));
    expect(rows.map((r) => r.name)).toEqual(["A Lanka"]);
  });

  it("tenant B can't read A's rows, even with a raw query naming A", async () => {
    const rows = await withTenant(app, B, (tx) => tx.execute(sql`select * from core.legal_entity where tenant_id = ${A}`));
    expect(rows.length).toBe(0);
    const tenants = await withTenant(app, B, (tx) => tx.execute(sql`select id from core.tenant`));
    expect(tenants.map((r) => r.id)).toEqual([B]);
  });

  it("tenant B can't write A's rows", async () => {
    expect(
      await pgError(withTenant(app, B, (tx) => tx.execute(sql`insert into core.legal_entity (tenant_id, name, country, base_currency) values (${A}, 'x', 'LK', 'LKR')`))),
    ).toMatch(/row-level security/);
    const updated = await withTenant(app, B, (tx) => tx.execute(sql`update core.legal_entity set name = 'hacked' where tenant_id = ${A}`));
    expect(updated.count).toBe(0);
    const deleted = await withTenant(app, B, (tx) => tx.execute(sql`delete from core.legal_entity`));
    expect(deleted.count).toBe(0);
  });

  it("no tenant set means no rows and no writes", async () => {
    const rows = await app.execute(sql`select * from core.legal_entity`);
    expect(rows.length).toBe(0);
    expect(await pgError(app.execute(sql`insert into core.legal_entity (tenant_id, name, country, base_currency) values (${A}, 'x', 'LK', 'LKR')`))).toMatch(/row-level security/);
  });

  it("audit is insert-only for the app role", async () => {
    expect(await pgError(withTenant(app, A, (tx) => tx.execute(sql`update core.audit_event set actor = 'x'`)))).toMatch(/permission denied/);
    expect(await pgError(withTenant(app, A, (tx) => tx.execute(sql`delete from core.audit_event`)))).toMatch(/permission denied/);
  });
});
