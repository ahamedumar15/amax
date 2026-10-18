import { sql } from "drizzle-orm";
import { afterAll, beforeAll } from "vitest";
import { migrate, migrationScopes, withTenant, type Tx } from "@amax/db";
import { freshDatabase, migratedDatabase, repoRoot } from "@amax/db/testdb";
import { configureRuntime, registryFrom, runDueJobs } from "@amax/core/server";
import { applyViewAs, installAuthorizer, setGrants, setViewerScopeResolvers, viewerForUser, type Role, type Viewer } from "@amax/auth";
import { configureAgents, setSuggestionKinds } from "@amax/agents/server";
import { agentsPlatform } from "@amax/agents/module";
import { authFixtures } from "@amax/auth/fixtures";
import { createRegistry } from "@amax/mcp";
import { syncSchedules, workflowRegistry } from "@amax/workflows/server";
import { loadFixtures, lumen } from "@amax/testing";
import { installedModules } from "./installed";

export const T = lumen.tenant.id;

/** A migrated database with every installed module (less `disabled`) seeded, its schedules synced, viewers by demo key, and the event tick. */
export async function insightsDb(disabled: string[] = []) {
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
  const registry = createRegistry(modules);
  const workflows = workflowRegistry(modules);
  const viewerFor = (tenantId: string, userId: string) => withTenant(app, tenantId, (tx) => viewerForUser(tx, tenantId, userId));
  configureAgents({ tools: () => registry, viewerFor, workflows: () => workflows });
  await syncSchedules(app, workflows);
  const as = async (key: string, role?: Role): Promise<Viewer> => {
    const [u] = await withTenant(app, T, (tx) => tx.execute(sql`select id from auth.user where email = ${`${key}@lumenlabs.test`}`));
    const v = (await viewerFor(T, u.id as string))!;
    return role ? applyViewAs(v, role) : v;
  };
  const q = (query: ReturnType<typeof sql>) => withTenant(app, T, (tx) => tx.execute(query));
  const tick = () => runDueJobs(app, registryFrom(modules));
  const call = async <R = Record<string, unknown>>(key: string, tool: string, args: object, role?: Role) => (await registry.call(await as(key, role), tool, args, { source: "mcp" })) as R;
  return { t, app, modules, as, q, registry, tick, call, tx: <R>(fn: (tx: Tx) => Promise<R>) => withTenant(app, T, fn) };
}

/** One seeded database for a describe block, dropped after it. */
export function sharedDb(disabled: string[] = []) {
  const box: { db?: Awaited<ReturnType<typeof insightsDb>> } = {};
  beforeAll(async () => { box.db = await insightsDb(disabled); }, 240_000);
  afterAll(() => box.db?.t.drop());
  return () => box.db!;
}
