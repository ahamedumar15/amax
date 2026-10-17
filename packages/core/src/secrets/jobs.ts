import { sql } from "drizzle-orm";
import type { Tx } from "@amax/db";
import type { JobDef } from "../module";

export const EXPIRY_WARNING_DAYS = [1, 7, 30] as const;
export const EXPIRING_EVENT = "secrets.credential.expiring";

async function revokeLapsedVersions(tx: Tx) {
  const rows = await tx.execute(sql`update secrets.version set revoked_at = now(), ciphertext = null
    where revoked_at is null and valid_until is not null and valid_until <= now() returning id`);
  return rows.length;
}

async function warnExpiring(tx: Tx, tenantId: string) {
  let sent = 0;
  for (const days of EXPIRY_WARNING_DAYS) {
    const due = await tx.execute(sql`update secrets.credential set warned_days = ${days}
      where revoked_at is null and expires_at is not null and expires_at <= now() + make_interval(days => ${days})
        and (warned_days is null or warned_days > ${days})
      returning connector, expires_at`);
    for (const c of due) {
      const payload = { connector: c.connector, expiresAt: new Date(c.expires_at as string).toISOString(), withinDays: days };
      await tx.execute(sql`insert into core.event (tenant_id, name, payload) values (${tenantId}, ${EXPIRING_EVENT}, ${JSON.stringify(payload)}::jsonb)`);
      sent++;
    }
  }
  return sent;
}

export const secretsSweepJob: JobDef = {
  name: "core.secrets.sweep",
  cron: "7 * * * *",
  async run({ tx, tenantId }) {
    await revokeLapsedVersions(tx);
    await warnExpiring(tx, tenantId);
  },
};
