import { join } from "node:path";
import postgres from "postgres";
import { createDb, migrate, migrationScopes } from "@amax/db";
import { loadFixtures, lumen } from "@amax/testing";
import { authFixtures } from "@amax/auth/fixtures";
import { upsertPasswordUser } from "@amax/auth/password";

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
  await loadFixtures(db, [{ id: "auth", fixtures: [authFixtures] }], lumen);
  await upsertPasswordUser(db, lumen.tenant.id, { email: "ops@lumenlabs.test", name: "Ops Admin", roles: ["Admin"], password: "e2e-ops-password" });
  await client.end();
}

// Run by the webServer command before `next start`, so the database exists when the app boots.
if (import.meta.url === `file://${process.argv[1]}`) await setupE2eDatabase();
