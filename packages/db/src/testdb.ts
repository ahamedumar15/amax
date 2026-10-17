import { randomBytes } from "node:crypto";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";
import { createDb } from "./client";
import { migrate, migrationScopes } from "./migrate";

export const repoRoot = join(fileURLToPath(import.meta.url), "../../../..");

// Real Postgres for tests. DB tests skip without DATABASE_MIGRATE_URL, except in CI where that's an error.
export const adminUrl = process.env.DATABASE_MIGRATE_URL;
if (process.env.CI && !adminUrl) throw new Error("CI: DATABASE_MIGRATE_URL must point at a Postgres the tests can create databases on");
export const hasDb = Boolean(adminUrl);

const withDb = (url: string, name: string) => {
  const u = new URL(url);
  u.pathname = `/${name}`;
  return u.toString();
};

// A throwaway database. `owner` runs migrations; `app()` connects as owner but switches to amax_app,
// so row-level security applies exactly as it does for the running app.
export async function freshDatabase() {
  const name = `amax_test_${randomBytes(4).toString("hex")}`;
  const admin = postgres(adminUrl!, { max: 1, onnotice: () => {} });
  await admin.unsafe(`create database ${name}`);
  const url = withDb(adminUrl!, name);
  const owner = postgres(url, { max: 4, onnotice: () => {} });
  const apps: postgres.Sql[] = [];
  return {
    name,
    url,
    owner,
    app() {
      const { db, client } = createDb(url, { max: 4, connection: { options: "-c role=amax_app" } as never });
      apps.push(client);
      return db;
    },
    async drop() {
      await Promise.all([owner.end(), ...apps.map((c) => c.end())]);
      await admin.unsafe(`drop database if exists ${name} with (force)`);
      await admin.end();
    },
  };
}

// A throwaway database with core and every installed module migrated.
export async function migratedDatabase() {
  const t = await freshDatabase();
  await migrate(t.owner, migrationScopes(repoRoot));
  return t;
}


// Tables the app role can reach without tenant isolation: any table with a tenant_id column
// (plus core.tenant) that lacks enabled + forced RLS or a policy. Modules assert this is empty.
export async function tablesMissingRls(owner: postgres.Sql): Promise<string[]> {
  const rows = await owner`
    select n.nspname || '.' || c.relname as name
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where c.relkind = 'r'
      and n.nspname not in ('pg_catalog', 'information_schema', 'amax_migrations')
      and (exists (select 1 from pg_attribute a where a.attrelid = c.oid and a.attname = 'tenant_id' and not a.attisdropped)
           or (n.nspname = 'core' and c.relname = 'tenant'))
      and not (c.relrowsecurity and c.relforcerowsecurity and exists (select 1 from pg_policy p where p.polrelid = c.oid))
    order by 1`;
  return rows.map((r) => r.name as string);
}
