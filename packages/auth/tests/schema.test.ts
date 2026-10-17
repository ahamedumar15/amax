import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { withTenant, type Db } from "@amax/db";
import { hasDb, migratedDatabase, tablesMissingRls } from "@amax/db/testdb";
import { entraIssuer, seedFirstTenant } from "../src/seed";

const env = {
  AMAX_SEED_TENANT_NAME: "Lumen Labs",
  AMAX_SEED_ENTRA_DIRECTORY_ID: "dir-lumen",
  AMAX_SEED_ENTRA_CLIENT_ID: "client-lumen",
  AMAX_SEED_ENTRA_CLIENT_SECRET_REF: "env:AMAX_ENTRA_CLIENT_SECRET",
  AMAX_SEED_ROLE_GROUPS: JSON.stringify({ "g-admins": ["Admin", "Leadership"], "g-eng": "Engineer" }),
};

describe("AC-2 first-tenant seed config", () => {
  it("rejects unknown roles and inline secrets", async () => {
    await expect(seedFirstTenant(null as never, { ...env, AMAX_SEED_ROLE_GROUPS: '{"g":"Wizard"}' })).rejects.toThrow(/unknown roles: Wizard/);
    await expect(seedFirstTenant(null as never, { ...env, AMAX_SEED_ENTRA_CLIENT_SECRET_REF: "s3cr3t" })).rejects.toThrow(/env:VAR_NAME/);
  });
});

describe.skipIf(!hasDb)("AC-6 auth schema", () => {
  let t: Awaited<ReturnType<typeof migratedDatabase>>;
  let app: Db;
  let tenantId: string;

  beforeAll(async () => {
    t = await migratedDatabase();
    app = t.app();
    ({ tenantId } = await seedFirstTenant(t.owner, env));
  });
  afterAll(() => t?.drop());

  it("every auth table is tenant-isolated", async () => {
    expect(await tablesMissingRls(t.owner)).toEqual([]);
    const [{ n }] = await t.owner`select count(*)::int as n from pg_tables where schemaname = 'auth'`;
    expect(n).toBe(8);
  });

  it("seeds once: tenant, provider and group mappings", async () => {
    expect((await seedFirstTenant(t.owner, env)).created).toBe(false);
    const maps = await withTenant(app, tenantId, (tx) => tx.execute(sql`select group_id, role from auth.role_mapping order by role`));
    expect(maps).toEqual([{ group_id: "g-admins", role: "Admin" }, { group_id: "g-eng", role: "Engineer" }, { group_id: "g-admins", role: "Leadership" }]);
  });

  it("resolves the tenant from issuer + directory before any tenant is set, and only that pair", async () => {
    const hit = await app.execute(sql`select * from auth.resolve_tenant(${entraIssuer("dir-lumen")}, 'dir-lumen')`);
    expect(hit.map((r) => r.tenant_id)).toEqual([tenantId]);
    expect((await app.execute(sql`select * from auth.resolve_tenant(${entraIssuer("dir-other")}, 'dir-lumen')`)).length).toBe(0);
    const providers = await app.execute(sql`select * from auth.list_providers()`);
    expect(providers[0]).toMatchObject({ tenant_name: "Lumen Labs", client_secret_ref: "env:AMAX_ENTRA_CLIENT_SECRET" });
  });

  it("the app role still can't read identity providers without the tenant set", async () => {
    expect((await app.execute(sql`select * from auth.identity_provider`)).length).toBe(0);
  });
});
