import { sql } from "drizzle-orm";
import { afterAll, beforeAll } from "vitest";
import { migrate, migrationScopes, withTenant, type Tx } from "@amax/db";
import { freshDatabase, migratedDatabase, repoRoot } from "@amax/db/testdb";
import { configureRuntime } from "@amax/core/server";
import { applyViewAs, installAuthorizer, setGrants, setViewerScopeResolvers, viewerForUser, type Role, type Viewer } from "@amax/auth";
import { authFixtures } from "@amax/auth/fixtures";
import { createRegistry } from "@amax/mcp";
import { loadFixtures, lumen } from "@amax/testing";
import { installedModules } from "./installed";

export const T = lumen.tenant.id;

/** A migrated database with every installed module (less `disabled`) seeded, viewers by demo key, and the MCP registry. */
export async function careerDb(disabled: string[] = []) {
  const t = disabled.length ? await freshDatabase() : await migratedDatabase();
  if (disabled.length) await migrate(t.owner, migrationScopes(repoRoot, disabled));
  const app = t.app();
  const modules = await installedModules(disabled);
  configureRuntime({ db: app, auditKey: "k".repeat(32) });
  setGrants(modules);
  setViewerScopeResolvers(modules.flatMap((m) => (m.viewerScopes ? [m.viewerScopes] : [])));
  installAuthorizer();
  await loadFixtures(app, [{ id: "auth", fixtures: [authFixtures] }, ...modules], lumen);
  const registry = createRegistry(modules);
  const as = async (key: string, role?: Role): Promise<Viewer> => {
    const [u] = await withTenant(app, T, (tx) => tx.execute(sql`select id from auth.user where email = ${`${key}@lumenlabs.test`}`));
    const v = (await withTenant(app, T, (tx) => viewerForUser(tx, T, u.id as string)))!;
    return role ? applyViewAs(v, role) : v;
  };
  const q = (query: ReturnType<typeof sql>) => withTenant(app, T, (tx) => tx.execute(query));
  const call = async <R = Record<string, unknown>>(key: string, tool: string, args: object, role?: Role) => (await registry.call(await as(key, role), tool, args, { source: "mcp" })) as R;
  return { t, app, modules, as, q, registry, call, tx: <R>(fn: (tx: Tx) => Promise<R>) => withTenant(app, T, fn) };
}

/** One seeded database for a describe block, dropped after it. */
export function sharedDb(disabled: string[] = []) {
  const box: { db?: Awaited<ReturnType<typeof careerDb>> } = {};
  beforeAll(async () => { box.db = await careerDb(disabled); }, 240_000);
  afterAll(() => box.db?.t.drop());
  return () => box.db!;
}
