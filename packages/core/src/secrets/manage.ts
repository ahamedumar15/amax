import { sql } from "drizzle-orm";
import { z } from "zod";
import type { Tx } from "@amax/db";
import { defineService } from "../service";
import { CONNECTOR_IDS, REVOKE_REASONS } from "./connectors";
import { seal } from "./crypto";
import { dataKeyFor } from "./runtime";

const RESOURCE = "secrets.credential";
const MANAGE = "secrets:credential:manage";

export const valueAad = (tenantId: string, credentialId: string, version: number) => `${tenantId}:${credentialId}:${version}`;

async function credentialFor(tx: Tx, tenantId: string, connector: string, expiresAt: string | null) {
  const [row] = await tx.execute(sql`insert into secrets.credential (tenant_id, connector, expires_at) values (${tenantId}, ${connector}, ${expiresAt})
    on conflict (tenant_id, connector) do update set expires_at = excluded.expires_at, warned_days = null, revoked_at = null, revoke_reason = null
    returning id, (xmax = 0) as created`);
  return { id: row.id as string, created: Boolean(row.created) };
}

export const putSecret = defineService({
  name: "secrets.credential.put",
  action: MANAGE,
  resource: RESOURCE,
  input: z.object({
    connector: z.enum(CONNECTOR_IDS),
    value: z.string().min(1).max(16_384),
    expiresAt: z.iso.datetime({ offset: true }).refine((v) => new Date(v) > new Date(), "must be in the future").nullable().default(null),
    graceHours: z.number().int().min(0).max(24 * 30).default(72),
  }),
  async run(tx, input, ctx) {
    const cred = await credentialFor(tx, ctx.tenantId, input.connector, input.expiresAt);
    const [prev] = await tx.execute(sql`select coalesce(max(version), 0)::int as v from secrets.version where credential_id = ${cred.id}`);
    const version = Number(prev.v) + 1;
    await tx.execute(sql`update secrets.version set valid_until = least(coalesce(valid_until, 'infinity'), now() + make_interval(hours => ${input.graceHours}))
      where credential_id = ${cred.id} and revoked_at is null`);
    const ciphertext = seal(await dataKeyFor(tx, ctx.tenantId), new TextEncoder().encode(input.value), valueAad(ctx.tenantId, cred.id, version));
    await tx.execute(sql`insert into secrets.version (tenant_id, credential_id, version, ciphertext, created_by) values (${ctx.tenantId}, ${cred.id}, ${version}, ${ciphertext}, ${ctx.actor.id})`);
    const after = { connector: input.connector, version, expiresAt: input.expiresAt, graceHours: input.graceHours };
    const name = version === 1 ? "secrets.credential.added" : "secrets.credential.rotated";
    return { result: { id: cred.id, version }, resourceId: cred.id, after, events: [{ name, payload: after }] };
  },
});

export const revokeSecret = defineService({
  name: "secrets.credential.revoke",
  action: MANAGE,
  resource: RESOURCE,
  input: z.object({ connector: z.enum(CONNECTOR_IDS), reason: z.enum(REVOKE_REASONS) }),
  async run(tx, input, ctx) {
    const [cred] = await tx.execute(sql`update secrets.credential set revoked_at = now(), revoke_reason = ${input.reason}
      where tenant_id = ${ctx.tenantId} and connector = ${input.connector} and revoked_at is null returning id`);
    if (!cred) throw new Error(`secrets: no active ${input.connector} credential to revoke`);
    await tx.execute(sql`update secrets.version set revoked_at = now(), ciphertext = null where credential_id = ${cred.id} and revoked_at is null`);
    const after = { connector: input.connector, reason: input.reason };
    return { result: { id: cred.id as string }, resourceId: cred.id as string, after, events: [{ name: "secrets.credential.revoked", payload: after }] };
  },
});
