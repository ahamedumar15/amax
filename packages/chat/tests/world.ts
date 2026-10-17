import { sql } from "drizzle-orm";
import { withTenant, type Db } from "@amax/db";
import { migratedDatabase } from "@amax/db/testdb";
import { configureRuntime } from "@amax/core/server";
import { installAuthorizer, setGrants, viewerForUser, type Viewer } from "@amax/auth";
import { authFixtures } from "@amax/auth/fixtures";
import { configureAi } from "@amax/ai";
import { fakeProvider, type FakeStep } from "@amax/ai/fake";
import { createRegistry } from "@amax/mcp";
import { loadFixtures, lumen } from "@amax/testing";
import { chatPlatform } from "../src";

export const T = lumen.tenant.id;
export const registry = createRegistry([chatPlatform]);

export async function chatWorld() {
  const t = await migratedDatabase();
  const app = t.app();
  configureRuntime({ db: app, auditKey: "k".repeat(32) });
  setGrants([chatPlatform]);
  installAuthorizer();
  await loadFixtures(app, [{ id: "auth", fixtures: [authFixtures] }], lumen);
  await t.owner`insert into ai.settings (tenant_id, zdr_confirmed) values (${T}, true)`;
  const as = async (key: string): Promise<Viewer> => {
    const [u] = await withTenant(app, T, (tx) => tx.execute(sql`select id from auth.user where email = ${`${key}@lumenlabs.test`}`));
    return (await withTenant(app, T, (tx) => viewerForUser(tx, T, u.id as string)))!;
  };
  return { t, app, as };
}

export const scripted = (app: Db, steps: FakeStep[]) => configureAi({ provider: fakeProvider(steps), db: app, model: "claude-haiku-5-5" });
