import { sql } from "drizzle-orm";
import { z } from "zod";
import { uuidArray, textArray, type Tx } from "@amax/db";
import { defineService } from "@amax/core/server";
import { newToken, tokenHash } from "./tokens";

export const CREDENTIAL_MANAGE = "api:credential:manage";
export const MAX_CREDENTIAL_DAYS = 365;
export const SCOPE = /^[a-z][a-z0-9-]*:(read|write|sensitive)$/;
export type Reveal = { label: string; value: string };

const notFound = (id: string) => Object.assign(new Error(`no active credential ${id}`), { retryable: false, code: "not_found" });

async function peopleIds(tx: Tx, emails: string[]) {
  if (!emails.length) return [];
  const rows = await tx.execute(sql`select id, email from auth.user where lower(email) = any(${textArray(emails.map((e) => e.toLowerCase()))}) and status = 'active'`);
  const missing = emails.filter((e) => !rows.some((r) => String(r.email).toLowerCase() === e.toLowerCase()));
  if (missing.length) throw Object.assign(new Error(`no active person with email ${missing.join(", ")}`), { retryable: false, code: "invalid_input" });
  return rows.map((r) => r.id as string);
}

const reveal = (value: string): Reveal => ({ label: "API key", value });
const withoutTokens = (tx: Tx, id: string) => tx.execute(sql`delete from auth.principal_token where principal_id = ${id}`);

export const createCredential = defineService({
  name: "auth.principal.create",
  action: CREDENTIAL_MANAGE,
  resource: "auth.service_principal",
  input: z.object({
    name: z.string().trim().min(2).max(80),
    scopes: z.array(z.string().regex(SCOPE)).min(1).max(40),
    actsFor: z.array(z.email()).max(200).default([]),
    days: z.number().int().min(1).max(MAX_CREDENTIAL_DAYS),
    ownerUserId: z.uuid(),
  }),
  async run(tx, input, ctx) {
    const actsFor = await peopleIds(tx, input.actsFor);
    const token = newToken("amx_sp");
    const [row] = await tx.execute(sql`insert into auth.service_principal (tenant_id, name, owner_user_id, scopes, acts_for, token_hash, expires_at)
      values (${ctx.tenantId}, ${input.name}, ${input.ownerUserId}, ${textArray(input.scopes)}, ${uuidArray(actsFor)}, ${tokenHash(token)},
              now() + make_interval(days => ${input.days})) returning id, expires_at`);
    const id = row.id as string;
    const after = { name: input.name, scopes: input.scopes, actsFor, days: input.days };
    return { result: { id, name: input.name, expiresAt: String(row.expires_at), reveal: reveal(token) }, resourceId: id, after, events: [{ name: "auth.principal.created", payload: { id, ...after } }] };
  },
});

export const rotateCredential = defineService({
  name: "auth.principal.rotate",
  action: CREDENTIAL_MANAGE,
  resource: "auth.service_principal",
  input: z.object({ id: z.uuid() }),
  async run(tx, input) {
    const token = newToken("amx_sp");
    const [row] = await tx.execute(sql`update auth.service_principal set token_hash = ${tokenHash(token)}
      where id = ${input.id} and revoked_at is null and expires_at > now() returning name`);
    if (!row) throw notFound(input.id);
    await withoutTokens(tx, input.id);
    const after = { name: row.name as string, rotated: true };
    return { result: { id: input.id, name: after.name, reveal: reveal(token) }, resourceId: input.id, after, events: [{ name: "auth.principal.rotated", payload: { id: input.id } }] };
  },
});

export const revokeCredential = defineService({
  name: "auth.principal.revoke",
  action: CREDENTIAL_MANAGE,
  resource: "auth.service_principal",
  input: z.object({ id: z.uuid(), reason: z.enum(["replaced", "compromised", "unused"]) }),
  async run(tx, input) {
    const [row] = await tx.execute(sql`update auth.service_principal set revoked_at = now() where id = ${input.id} and revoked_at is null returning name`);
    if (!row) throw notFound(input.id);
    await withoutTokens(tx, input.id);
    const after = { name: row.name as string, reason: input.reason };
    return { result: { id: input.id, revoked: true }, resourceId: input.id, after, events: [{ name: "auth.principal.revoked", payload: { id: input.id, reason: input.reason } }] };
  },
});
