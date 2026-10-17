import { join } from "node:path";
import postgres from "postgres";
import { createDb, migrate, migrationScopes } from "@amax/db";
import { loadFixtures, lumen } from "@amax/testing";
import { authFixtures } from "@amax/auth/fixtures";
import { upsertPasswordUser } from "@amax/auth/password";
import { deliveryFixtures } from "../../../../modules/delivery/fixtures/index";
import { readSpecclaw } from "../../../../modules/delivery/sync/specclaw";
import { syncSpecclaw } from "../../../../modules/delivery/sync/import";
import { configureRuntime } from "@amax/core/server";
import { authenticateToken, createPrincipal, installAuthorizer, principalContext, setGrants, viewerForUser } from "@amax/auth";
import { withTenant } from "@amax/db";
import { sql } from "drizzle-orm";

// Fresh amax_e2e database: migrate, then seed Lumen Labs and its demo users as the app role.
export const E2E_DB = "amax_e2e";

export default async function setupE2eDatabase() {
  const admin = process.env.DATABASE_MIGRATE_URL;
  if (!admin) throw new Error("e2e:auth needs DATABASE_MIGRATE_URL");
  const root = postgres(admin, { max: 1, onnotice: () => {} });
  await root.unsafe(`drop database if exists ${E2E_DB} with (force)`);
  await root.unsafe(`create database ${E2E_DB}`);
  await root.end();
  const ownerUrl = Object.assign(new URL(admin), { pathname: `/${E2E_DB}` }).toString();
  const owner = postgres(ownerUrl, { max: 1, onnotice: () => {} });
  await migrate(owner, migrationScopes(join(import.meta.dirname, "../../../..")));
  await owner.end();
  const { db, client } = createDb(ownerUrl, { max: 1, connection: { options: "-c role=amax_app" } as never });
  await loadFixtures(db, [{ id: "auth", fixtures: [authFixtures] }, { id: "delivery", dependsOn: ["auth"], fixtures: [deliveryFixtures] }], lumen);
  await upsertPasswordUser(db, lumen.tenant.id, { email: "ops@lumenlabs.test", name: "Ops Admin", roles: ["Admin"], password: "e2e-ops-password" });
  // 039: amax's own specs as project AMX, imported by a service principal like the real sync.
  configureRuntime({ db, auditKey: "e2e-audit-key-e2e-audit-key-e2e-audit" });
  setGrants([{ grants: { PM: ["delivery:read"] } }]);
  installAuthorizer();
  const [ops] = await withTenant(db, lumen.tenant.id, (tx) => tx.execute(sql`select id from auth.user where email = 'ops@lumenlabs.test'`));
  const opsViewer = (await withTenant(db, lumen.tenant.id, (tx) => viewerForUser(tx, lumen.tenant.id, ops.id as string)))!;
  const { token } = await createPrincipal(db, opsViewer, { name: "specclaw-sync", scopes: ["delivery:proposal:sync"], actsFor: [], days: 1 });
  const id = await authenticateToken(db, token);
  if (id?.kind !== "principal") throw new Error("no principal");
  const ctx = await principalContext(db, id.principal, "delivery:proposal:sync");
  await syncSpecclaw(db, ctx, { projectKey: "AMX", projectName: "amax", client: "Internal", records: readSpecclaw(join(import.meta.dirname, "../../../..")), sha: "e2e" });
  // 005: AI on for the e2e tenant (the scripted model stands in for Claude).
  await withTenant(db, lumen.tenant.id, (tx) => tx.execute(sql`insert into ai.settings (tenant_id, zdr_confirmed) values (${lumen.tenant.id}, true) on conflict do nothing`));
  await client.end();
}

// Run by the webServer command before `next start`, so the database exists when the app boots.
if (import.meta.url === `file://${process.argv[1]}`) await setupE2eDatabase();
