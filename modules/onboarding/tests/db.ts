import { sql } from "drizzle-orm";
import { withTenant, type Tx } from "@amax/db";
import { migratedDatabase } from "@amax/db/testdb";
import { configureRuntime, registryFrom, runDueJobs } from "@amax/core/server";
import { applyViewAs, installAuthorizer, setGrants, setViewerScopeResolvers, viewerForUser, type Role, type Viewer } from "@amax/auth";
import { authFixtures } from "@amax/auth/fixtures";
import { createRegistry } from "@amax/mcp";
import { loadFixtures, lumen } from "@amax/testing";
import { installedModules } from "./installed";

export const T = lumen.tenant.id;

/** A migrated database with every installed module's fixtures (less `disabled`), viewers by demo key, and the event tick. */
export async function onboardingDb(disabled: string[] = []) {
  const t = await migratedDatabase();
  const app = t.app();
  const modules = await installedModules(disabled);
  configureRuntime({ db: app, auditKey: "k".repeat(32) });
  setGrants(modules);
  setViewerScopeResolvers(modules.flatMap((m) => (m.viewerScopes ? [m.viewerScopes] : [])));
  installAuthorizer();
  await loadFixtures(app, [{ id: "auth", fixtures: [authFixtures] }, ...modules], lumen);
  const as = async (key: string, role?: Role): Promise<Viewer> => {
    const [u] = await withTenant(app, T, (tx) => tx.execute(sql`select id from auth.user where email = ${`${key}@lumenlabs.test`}`));
    const v = (await withTenant(app, T, (tx) => viewerForUser(tx, T, u.id as string)))!;
    return role ? applyViewAs(v, role) : v;
  };
  const q = (query: ReturnType<typeof sql>) => withTenant(app, T, (tx) => tx.execute(query));
  const registry = createRegistry(modules);
  /** Delivers the outbox to every installed handler, as the job tick does. */
  const tick = () => runDueJobs(app, registryFrom(modules));
  return { t, app, modules, as, q, registry, tick, tx: <R>(fn: (tx: Tx) => Promise<R>) => withTenant(app, T, fn) };
}
