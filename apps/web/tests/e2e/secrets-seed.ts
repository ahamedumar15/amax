import { randomBytes } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { sql } from "drizzle-orm";
import { withTenant, type Db } from "@amax/db";
import { contextFor } from "@amax/core/server";
import { configureSecrets, localKms, parseKeyFile, putSecret, revokeSecret, type ConnectorId } from "@amax/core/secrets";

const DAY = 86_400_000;
type Seed = { connector: ConnectorId; rotated: number; expires?: number; used?: [number | string, string]; revoked?: number };

const SEEDS: Seed[] = [
  { connector: "msgraph-read", rotated: -45, expires: 136, used: ["06:00", "sync job"] },
  { connector: "msgraph-write", rotated: -45, expires: 136, used: [-2, "Sahan Kumara approved"] },
  { connector: "azure-devops", rotated: -171, expires: 12, used: ["09:42", "webhook"] },
  { connector: "xero", rotated: -64, expires: 120, used: [-16, "pay run journal"] },
  { connector: "keyflow", rotated: -16, expires: 166, used: ["07:00", "sync job"] },
  { connector: "zoho-sign", rotated: -129, revoked: -17 },
];

const at = (offset: number | string, now = new Date()) =>
  typeof offset === "number" ? new Date(now.getTime() + offset * DAY).toISOString() : `${now.toISOString().slice(0, 10)}T${offset}:00Z`;

export async function seedSecrets(db: Db, tenantId: string, keyFile: string) {
  writeFileSync(keyFile, randomBytes(32).toString("hex"), { mode: 0o600 });
  configureSecrets({ kms: localKms(parseKeyFile(readFileSync(keyFile, "utf8"))) });
  const ctx = contextFor.job(tenantId, "e2e-seed");
  for (const s of SEEDS) {
    await putSecret(ctx, { connector: s.connector, value: `test-${s.connector}-${randomBytes(8).toString("hex")}`, expiresAt: s.expires ? at(s.expires) : null });
    if (s.revoked) await revokeSecret(ctx, { connector: s.connector, reason: "replaced" });
    await withTenant(db, tenantId, async (tx) => {
      await tx.execute(sql`update secrets.version v set created_at = ${at(s.rotated)} from secrets.credential c where c.id = v.credential_id and c.connector = ${s.connector}`);
      await tx.execute(sql`update secrets.credential set revoked_at = ${s.revoked ? at(s.revoked) : null}, last_used_at = ${s.used ? at(s.used[0]) : null}, last_used_purpose = ${s.used?.[1] ?? null} where connector = ${s.connector}`);
    });
  }
}
