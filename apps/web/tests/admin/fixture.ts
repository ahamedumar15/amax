import { randomBytes } from "node:crypto";
import { sql } from "drizzle-orm";
import { withTenant } from "@amax/db";
import { migratedDatabase } from "@amax/db/testdb";
import { configureRuntime } from "@amax/core/server";
import { configureSecrets, localKms } from "@amax/core/secrets";
import { installAuthorizer, setGrants, viewerForUser, type Viewer } from "@amax/auth";
import { authFixtures } from "@amax/auth/fixtures";
import { createRegistry, type Registry } from "@amax/mcp";
import { loadFixtures, lumen } from "@amax/testing";
import { cron, defineWorkflow } from "@amax/workflows";
import { createPostgresEngine, syncSchedules, workflowRegistry } from "@amax/workflows/server";
import { adminModule } from "../../lib/admin";
import { platformWorkflows } from "../../lib/platform-workflows";

export const T = lumen.tenant.id;
export const AU = lumen.entities.find((e) => e.key === "au")!;

// A per-entity schedule, so the AU entity (no default zone) has something waiting for set_entity_zone.
const payReminder = defineWorkflow({ name: "test.pay-reminder", title: "Payroll reminder", async run() { return { ok: true }; } });
const testSchedules = { id: "test", workflows: [payReminder], schedules: [cron({ name: "test.pay-reminder", title: "Payroll reminder", workflow: "test.pay-reminder", cron: "0 9 * * 1", timezone: "entity" })] };

/** A migrated database with Lumen Labs' demo users, a local key service and the admin tools. */
export async function adminDb() {
  const t = await migratedDatabase();
  const app = t.app();
  configureRuntime({ db: app, auditKey: "k".repeat(32) });
  configureSecrets({ kms: localKms(new Uint8Array(randomBytes(32))) });
  setGrants([]);
  installAuthorizer();
  await loadFixtures(app, [{ id: "auth", fixtures: [authFixtures] }], lumen);
  await t.owner`insert into ai.settings (tenant_id, zdr_confirmed) values (${T}, true) on conflict do nothing`;
  const workflows = workflowRegistry([platformWorkflows, testSchedules]);
  await syncSchedules(app, workflows);
  const engine = createPostgresEngine({ db: app, registry: workflows });
  let registry: Registry;
  registry = createRegistry([adminModule({ db: () => app, workflows: () => workflows, engine: async () => engine, tools: () => registry })]);
  const as = async (key: string): Promise<Viewer> => {
    const [u] = await withTenant(app, T, (tx) => tx.execute(sql`select id from auth.user where email = ${`${key}@lumenlabs.test`}`));
    return (await withTenant(app, T, (tx) => viewerForUser(tx, T, u.id as string)))!;
  };
  return { t, app, registry, engine, as };
}
