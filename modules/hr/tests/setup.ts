import { sql } from "drizzle-orm";
import { withTenant, type Db, type Tx } from "@amax/db";
import { migratedDatabase } from "@amax/db/testdb";
import { configureRuntime } from "@amax/core/server";
import { applyViewAs, installAuthorizer, setGrants, setViewerScopeResolvers, viewerForUser, type Role, type Viewer } from "@amax/auth";
import { authFixtures } from "@amax/auth/fixtures";
import { loadFixtures, lumen } from "@amax/testing";
import hr from "../module";

export const T = lumen.tenant.id;
export const TODAY = new Date("2026-10-16T12:00:00Z");

/** A migrated database with the auth and hr fixtures, and viewers for Maya as each role. */
export async function hrDatabase() {
  const t = await migratedDatabase();
  const app: Db = t.app();
  configureRuntime({ db: app, auditKey: "k".repeat(32) });
  setGrants([hr]);
  setViewerScopeResolvers([hr.viewerScopes!]);
  installAuthorizer();
  await loadFixtures(app, [{ id: "auth", fixtures: [authFixtures] }, hr], lumen);
  const as = async (key: string): Promise<Viewer> => {
    const [u] = await withTenant(app, T, (tx) => tx.execute(sql`select id from auth.user where email = ${`${key}@lumenlabs.test`}`));
    return (await withTenant(app, T, (tx) => viewerForUser(tx, T, u.id as string)))!;
  };
  const maya = await as("maya");
  const mayaAs = (role: Role) => applyViewAs(maya, role);
  const tx = <R>(fn: (tx: Tx) => Promise<R>) => withTenant(app, T, fn);
  return { t, app, as, maya, mayaAs, tx };
}
