import { randomBytes } from "node:crypto";
import { withTenant } from "@amax/db";
import { migratedDatabase } from "@amax/db/testdb";
import { configureBackups } from "../src/backup";
import { configureSecrets, localKms } from "../src/secrets";
import { ensureDataKey } from "../src/secrets/datakey";
import { configureRuntime, contextFor, memoryStorage, setAuthorizer, type ServiceContext } from "../src/server";

export const T = "00000000-0000-4000-8000-0000000034a1";
const uid = (n: number) => `00000000-0000-4000-8000-0000000034${String(n).padStart(2, "0")}`;
export const USERS = { maya: uid(11), sahan: uid(12), ravi: uid(13) };
export const as = (user: keyof typeof USERS, roles = ["Admin"]): ServiceContext => ({ tenantId: T, actor: { id: `user:${USERS[user]}`, kind: "user", roles }, source: "chat" });
export const job = () => contextFor.job(T, "backup-test");

/** A tenant with two Admins and an IT Admin (fictional), a data key, and storage in LK and AU. */
export async function backupDb() {
  const t = await migratedDatabase();
  await t.owner`insert into core.tenant (id, name) values (${T}, 'Backup test (fictional)')`;
  for (const [key, id] of Object.entries(USERS)) await t.owner`insert into auth.user (id, tenant_id, email, name, password_hash) values (${id}, ${T}, ${`${key}@example.test`}, ${`${key[0].toUpperCase()}${key.slice(1)} Test`}, 'hash-never-exported')`;
  await t.owner`insert into ai.settings (tenant_id, data_region) values (${T}, 'AU')`;
  const app = t.app();
  configureRuntime({ db: app, auditKey: "b".repeat(32) });
  configureSecrets({ kms: localKms(new Uint8Array(randomBytes(32))) });
  setAuthorizer((ctx) => ctx.actor.kind === "system" || !!ctx.actor.roles?.includes("Admin"));
  const regions = { AU: memoryStorage(), LK: memoryStorage() };
  const files = memoryStorage();
  const started: { workflow: string; input: Record<string, string> }[] = [];
  configureBackups({ storageFor: (r) => (r ? (regions as Record<string, ReturnType<typeof memoryStorage>>)[r] ?? null : null), files: () => files, linkKey: "l".repeat(32),
    start: async (_t, workflow, input) => (started.push({ workflow, input }), "run-1") });
  await ensureDataKey(as("maya"));
  const tx = <R>(fn: Parameters<typeof withTenant<R>>[2]) => withTenant(app, T, fn);
  return { t, app, tx, regions, files, started };
}
