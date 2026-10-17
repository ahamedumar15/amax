import { sql } from "drizzle-orm";
import { z } from "zod";
import { withTenant } from "@amax/db";
import type { ServiceContext } from "../authorize";
import { defineService, getRuntime } from "../service";
import { CONNECTOR_IDS, type ConnectorId } from "./connectors";
import { open } from "./crypto";
import { valueAad } from "./manage";
import { dataKeyFor } from "./runtime";
import { assertNoLeak, scrubError, Secret } from "./secret";

export type SecretUse = { connector: ConnectorId; purpose: string };

export class SecretNotConfiguredError extends Error {
  readonly retryable = false;
  constructor(connector: string, why: "missing" | "expired") {
    super(why === "expired" ? `secrets: the ${connector} credential has expired; an Admin must rotate it` : `secrets: no active ${connector} credential; an Admin must add one`);
    this.name = "SecretNotConfiguredError";
  }
}

const recordUse = defineService({
  name: "secrets.credential.use",
  action: "secrets:credential:use",
  resource: "secrets.credential",
  keyless: true,
  input: z.object({ connector: z.enum(CONNECTOR_IDS), purpose: z.string().trim().min(1).max(120), all: z.boolean() }),
  async run(tx, input, ctx) {
    const rows = await tx.execute(sql`select c.id as credential_id, c.expires_at, v.version from secrets.credential c
      join secrets.version v on v.credential_id = c.id
      where c.connector = ${input.connector} and c.revoked_at is null and v.revoked_at is null and (v.valid_until is null or v.valid_until > now())
      order by v.version desc`);
    if (!rows.length) throw new SecretNotConfiguredError(input.connector, "missing");
    const expires = rows[0].expires_at as Date | string | null;
    if (expires && new Date(expires) <= new Date()) throw new SecretNotConfiguredError(input.connector, "expired");
    const id = rows[0].credential_id as string;
    const versions = (input.all ? rows : rows.slice(0, 1)).map((r) => Number(r.version));
    await tx.execute(sql`update secrets.credential set last_used_at = now(), last_used_by = ${ctx.actor.id}, last_used_purpose = ${input.purpose} where id = ${id}`);
    return { result: { id, versions }, resourceId: id, after: { connector: input.connector, purpose: input.purpose, versions } };
  },
});

async function decrypt(ctx: ServiceContext, use: { id: string; versions: number[] }, connector: string) {
  return withTenant(getRuntime().db, ctx.tenantId, async (tx) => {
    const rows = await tx.execute(sql`select version, ciphertext from secrets.version where credential_id = ${use.id} and ciphertext is not null`);
    const byVersion = new Map(rows.map((r) => [Number(r.version), r.ciphertext as string]));
    if (use.versions.some((v) => !byVersion.has(v))) throw new SecretNotConfiguredError(connector, "missing");
    const key = await dataKeyFor(tx, ctx.tenantId);
    return use.versions.map((v) => new TextDecoder().decode(open(key, byVersion.get(v)!, valueAad(ctx.tenantId, use.id, v))));
  });
}

async function run<T>(ctx: ServiceContext, req: SecretUse, all: boolean, fn: (secrets: Secret[]) => Promise<T>): Promise<T> {
  const values = await decrypt(ctx, await recordUse(ctx, { ...req, all }), req.connector);
  let result: T;
  try {
    result = await fn(values.map((v) => new Secret(v)));
  } catch (e) {
    throw scrubError(e, values);
  }
  return assertNoLeak(result, values, req.connector);
}

export const useSecret = <T>(ctx: ServiceContext, req: SecretUse, fn: (secret: Secret) => Promise<T>) => run(ctx, req, false, ([s]) => fn(s));

export const useValidSecrets = <T>(ctx: ServiceContext, req: SecretUse, fn: (secrets: Secret[]) => Promise<T>) => run(ctx, req, true, fn);
