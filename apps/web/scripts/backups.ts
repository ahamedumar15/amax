import { join } from "node:path";
import { readFileSync } from "node:fs";
import { sql } from "drizzle-orm";
import { createDb, withTenant } from "@amax/db";
import { loadEnv } from "@amax/core/env";
import { configureRuntime, contextFor, storageFromEnv } from "@amax/core/server";
import { configureSecrets, kmsFromEnv } from "@amax/core/secrets";
import { ensureDataKey } from "@amax/core/secrets/datakey";
import { backupStorageFromEnv, configureBackups, pitrFromEnv, recordDrill, restoreLatest, snapshotKind, takeSnapshot } from "@amax/core/backup";
import { installAuthorizer } from "@amax/auth";

// 034 AC-3: the restore drill runner (the k3s CronJob, a Podman timer, or a scheduled CI job), and a
// one-off snapshot for operators and CI. Usage: `backups.ts drill` | `backups.ts snapshot --tenant <id>`.
const root = join(import.meta.dirname, "../../..");
const env = loadEnv();
if (!env.DATABASE_URL || !env.AUDIT_HASH_KEY) throw new Error("backups: DATABASE_URL (the app role) and AUDIT_HASH_KEY are required");
const { db, client } = createDb(env.DATABASE_URL, { max: 2 });
configureRuntime({ db, auditKey: env.AUDIT_HASH_KEY });
configureSecrets({ kms: kmsFromEnv(env, (p) => readFileSync(p, "utf8")) });
configureBackups({ storageFor: backupStorageFromEnv(env), files: () => storageFromEnv(), pitr: pitrFromEnv(env) });
installAuthorizer();

async function snapshot(tenantId: string) {
  const ctx = contextFor.job(tenantId, "core.backup-snapshot");
  await ensureDataKey(ctx);
  const out = await takeSnapshot(ctx, { kind: await withTenant(db, tenantId, snapshotKind) });
  console.log(`snapshot ${out.id}: ${out.rows} rows in ${out.tables} tables (${out.kind}, region ${out.region ?? "none"})`);
}

async function drill() {
  if (!env.AMAX_DRILL_DATABASE_URL) throw new Error("backups drill: AMAX_DRILL_DATABASE_URL (a scratch database it may wipe) is required");
  const due = await db.execute(sql`select tenant_id, drill_id from backup.drills_due()`);
  let failed = 0;
  for (const d of due) {
    const tenantId = d.tenant_id as string;
    const out = await restoreLatest({ live: db, scratchUrl: env.AMAX_DRILL_DATABASE_URL, root, tenantId, drillId: (d.drill_id as string | null) ?? null });
    const rec = await recordDrill(contextFor.job(tenantId, "core.restore-drill"), out);
    if (rec.status === "failed") failed++;
    console.log(`drill ${rec.id} tenant ${tenantId}: ${rec.status}, ${out.rowsChecked} rows in ${out.tablesChecked} tables, chain ${out.chainOk ? "verified" : "not verified"}, ${Math.round(out.durationMs / 1000)} s${out.error ? `: ${out.error}` : ""}`);
  }
  if (!due.length) console.log("drill: no tenant is due a drill");
  return failed;
}

const [cmd, flag, value] = process.argv.slice(2);
try {
  if (cmd === "snapshot" && flag === "--tenant" && value) await snapshot(value);
  else if (cmd === "drill") process.exitCode = (await drill()) ? 1 : 0;
  else throw new Error("usage: backups.ts drill | backups.ts snapshot --tenant <id>");
} finally {
  await client.end();
}
