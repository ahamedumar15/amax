import { createHash, randomBytes } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
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
export async function freshDatabase(template?: string) {
  const name = `amax_test_${randomBytes(4).toString("hex")}`;
  const admin = postgres(adminUrl!, { max: 1, onnotice: () => {} });
  await admin.unsafe(template ? `create database ${name} template ${template}` : `create database ${name}`);
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

// Migrating core and every module per test file outgrew CI's setup timeout once the modules multiplied
// (061). So the schema is migrated once into a template database named by a hash of the migration
// files, and each test gets a copy: `create database … template` takes well under a second.
const TEMPLATE_PREFIX = "amax_tpl_";
const KEEP_TEMPLATES = 3;

export function migrationHash(root = repoRoot) {
  const h = createHash("sha256");
  for (const scope of migrationScopes(root)) {
    for (const file of readdirSync(scope.dir).filter((f) => f.endsWith(".sql")).sort()) h.update(`${scope.name}/${file}\0`).update(readFileSync(join(scope.dir, file))).update("\0");
  }
  return h.digest("hex").slice(0, 16);
}

// One build per migration set across every worker and package sharing this Postgres: the first holds
// an advisory lock while it builds under a temporary name and renames it when done, so a template that
// exists is complete. Templates beyond the newest few (other branches, older migrations) are dropped.
async function buildTemplate(name: string) {
  const admin = postgres(adminUrl!, { max: 1, onnotice: () => {} });
  try {
    await admin`select pg_advisory_lock(hashtext('amax_test_template'))`;
    const [found] = await admin`select 1 from pg_database where datname = ${name}`;
    if (!found) {
      const building = `${name}_building`;
      await admin.unsafe(`drop database if exists ${building} with (force)`);
      await admin.unsafe(`create database ${building}`);
      const owner = postgres(withDb(adminUrl!, building), { max: 1, onnotice: () => {} });
      try {
        await migrate(owner, migrationScopes(repoRoot));
      } finally {
        await owner.end();
      }
      await admin.unsafe(`alter database ${building} rename to ${name}`);
    }
    const stale = await admin`select datname from pg_database where datname like ${`${TEMPLATE_PREFIX}%`} and datname not like '%_building' and datname <> ${name}
      order by oid desc offset ${KEEP_TEMPLATES - 1}`;
    for (const r of stale) await admin.unsafe(`drop database if exists ${r.datname} with (force)`);
  } finally {
    await admin`select pg_advisory_unlock(hashtext('amax_test_template'))`.catch(() => {});
    await admin.end();
  }
  return name;
}

let template: Promise<string> | undefined;
export const migratedTemplate = () => (template ??= buildTemplate(`${TEMPLATE_PREFIX}${migrationHash()}`));

// A throwaway database with core and every installed module migrated: a copy of the template.
export async function migratedDatabase() {
  return freshDatabase(await migratedTemplate());
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
