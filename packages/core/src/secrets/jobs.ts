import { sql } from "drizzle-orm";
import { z } from "zod";
import type { Tx } from "@amax/db";
import { contextFor } from "../authorize";
import type { JobDef } from "../module";
import { defineService } from "../service";

export const EXPIRY_WARNING_DAYS = [1, 7, 30] as const;
export const EXPIRY_WINDOW_DAYS = Math.max(...EXPIRY_WARNING_DAYS);
export const EXPIRING_EVENT = "secrets.credential.expiring";
const JOB = "core.secrets.sweep";

const lapsed = sql`v.revoked_at is null and v.valid_until is not null and v.valid_until <= now()`;
const warnDue = (days: number) => sql`c.revoked_at is null and c.expires_at is not null and c.expires_at > now()
  and c.expires_at <= now() + make_interval(days => ${days}) and (c.warned_days is null or c.warned_days > ${days})`;

async function revokeLapsed(tx: Tx) {
  const rows = await tx.execute(sql`update secrets.version v set revoked_at = now(), ciphertext = null from secrets.credential c
    where c.id = v.credential_id and ${lapsed} returning c.connector, v.version`);
  return rows.map((r) => ({ connector: r.connector as string, version: Number(r.version) }));
}

async function markWarnings(tx: Tx) {
  const warned: { connector: string; expiresAt: string; withinDays: number }[] = [];
  for (const days of EXPIRY_WARNING_DAYS) {
    const rows = await tx.execute(sql`update secrets.credential c set warned_days = ${days} where ${warnDue(days)} returning connector, expires_at`);
    warned.push(...rows.map((r) => ({ connector: r.connector as string, expiresAt: new Date(r.expires_at as string).toISOString(), withinDays: days })));
  }
  return warned;
}

const sweepSecrets = defineService({
  name: "secrets.sweep",
  action: "secrets:credential:sweep",
  resource: "secrets.credential",
  keyless: true,
  input: z.object({}),
  async run(tx) {
    const revoked = await revokeLapsed(tx);
    const warned = await markWarnings(tx);
    return { result: { revoked: revoked.length, warned: warned.length }, after: { revoked, warned }, events: warned.map((payload) => ({ name: EXPIRING_EVENT, payload })) };
  },
});

async function anythingDue(tx: Tx) {
  const [r] = await tx.execute(sql`select exists (select 1 from secrets.version v where ${lapsed})
    or exists (select 1 from secrets.credential c where ${sql.join(EXPIRY_WARNING_DAYS.map((d) => sql`(${warnDue(d)})`), sql` or `)}) as due`);
  return Boolean(r.due);
}

export const secretsSweepJob: JobDef = {
  name: JOB,
  cron: "7 * * * *",
  async run({ tx, tenantId }) {
    if (await anythingDue(tx)) await sweepSecrets(contextFor.job(tenantId, JOB), {});
  },
};
