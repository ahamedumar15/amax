import { sql } from "drizzle-orm";
import { migrate, migrationScopes, withTenant } from "@amax/db";
import { freshDatabase, repoRoot } from "@amax/db/testdb";
import { configureRuntime } from "@amax/core/server";
import { applyViewAs, installAuthorizer, setGrants, setViewerScopeResolvers, viewerForUser, type Role, type Viewer } from "@amax/auth";
import { authFixtures } from "@amax/auth/fixtures";
import { loadFixtures, lumen } from "@amax/testing";
import { installedModules } from "./installed";

export const T = lumen.tenant.id;

/** A database migrated and seeded with every installed module (less `disabled`), and viewers by demo key. */
export async function complianceDb(disabled: string[] = []) {
  const t = await freshDatabase();
  await migrate(t.owner, migrationScopes(repoRoot, disabled));
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
  const events = async (name: string) => (await q(sql`select payload from core.event where name = ${name} order by created_at`)).map((r) => r.payload as Record<string, unknown>);
  return { t, app, modules, as, q, events };
}
