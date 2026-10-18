import { sql } from "drizzle-orm";
import { afterAll, beforeAll } from "vitest";
import { migrate, migrationScopes, withTenant, type Tx } from "@amax/db";
import { freshDatabase, migratedDatabase, repoRoot } from "@amax/db/testdb";
import { configureRuntime, registryFrom, runDueJobs } from "@amax/core/server";
import { applyViewAs, installAuthorizer, setGrants, setViewerScopeResolvers, viewerForUser, type Role, type Viewer } from "@amax/auth";
import { setSuggestionKinds } from "@amax/agents/server";
import { agentsPlatform } from "@amax/agents/module";
import { authFixtures } from "@amax/auth/fixtures";
import { createRegistry } from "@amax/mcp";
import { loadFixtures, lumen } from "@amax/testing";
import { installedModules } from "./installed";

export const T = lumen.tenant.id;

/** A migrated database with every installed module (less `disabled`) seeded, viewers by demo key, and the event tick. */
export async function accessDb(disabled: string[] = []) {
  const t = disabled.length ? await freshDatabase() : await migratedDatabase();
  if (disabled.length) await migrate(t.owner, migrationScopes(repoRoot, disabled));
  const app = t.app();
  const modules = await installedModules(disabled);
  configureRuntime({ db: app, auditKey: "k".repeat(32) });
  setGrants([...modules, agentsPlatform as never]);
  setViewerScopeResolvers(modules.flatMap((m) => (m.viewerScopes ? [m.viewerScopes] : [])));
  setSuggestionKinds(modules.flatMap((m) => m.suggestions ?? []));
  installAuthorizer();
  await loadFixtures(app, [{ id: "auth", fixtures: [authFixtures] }, ...modules], lumen);
  const as = async (key: string, role?: Role): Promise<Viewer> => {
    const [u] = await withTenant(app, T, (tx) => tx.execute(sql`select id from auth.user where email = ${`${key}@lumenlabs.test`}`));
    const v = (await withTenant(app, T, (tx) => viewerForUser(tx, T, u.id as string)))!;
    return role ? applyViewAs(v, role) : v;
  };
  const q = (query: ReturnType<typeof sql>) => withTenant(app, T, (tx) => tx.execute(query));
  const registry = createRegistry(modules);
  const tick = () => runDueJobs(app, registryFrom(modules));
  return { t, app, modules, as, q, registry, tick, tx: <R>(fn: (tx: Tx) => Promise<R>) => withTenant(app, T, fn) };
}

/** One seeded database for a describe block (ticked once when `tick`), dropped after it. */
export function sharedDb(tick = false) {
  const box: { db?: Awaited<ReturnType<typeof accessDb>> } = {};
  beforeAll(async () => { box.db = await accessDb(); if (tick) await box.db.tick(); }, 240_000);
  afterAll(() => box.db?.t.drop());
  return () => box.db!;
}
