import { sql } from "drizzle-orm";
import { z } from "zod";
import { withTenant } from "@amax/db";
import { appendAudit } from "../audit";
import type { ServiceContext } from "../authorize";
import { getRuntime } from "../service";
import { CONNECTOR_IDS, type ConnectorId } from "./connectors";
import { open } from "./crypto";
import { valueAad } from "./manage";
import { dataKeyFor } from "./runtime";
import { assertNoLeak, formsOf, scrubError, Secret } from "./secret";

export type SecretUse = { connector: ConnectorId; purpose: string };
const useInput = z.object({ connector: z.enum(CONNECTOR_IDS), purpose: z.string().trim().min(1).max(120) });

export class SecretNotConfiguredError extends Error {
  readonly retryable = false;
  constructor(connector: string, why: "missing" | "expired") {
    super(why === "expired" ? `secrets: the ${connector} credential has expired; an Admin must rotate it` : `secrets: no active ${connector} credential; an Admin must add one`);
    this.name = "SecretNotConfiguredError";
  }
}

async function load(ctx: ServiceContext, req: SecretUse, all: boolean) {
  return withTenant(getRuntime().db, ctx.tenantId, async (tx) => {
    const rows = await tx.execute(sql`select c.id as credential_id, c.expires_at, v.version, v.ciphertext from secrets.credential c
      join secrets.version v on v.credential_id = c.id
      where c.connector = ${req.connector} and c.revoked_at is null and v.revoked_at is null and (v.valid_until is null or v.valid_until > now())
      order by v.version desc`);
    if (!rows.length) throw new SecretNotConfiguredError(req.connector, "missing");
    const expires = rows[0].expires_at as Date | string | null;
    if (expires && new Date(expires) <= new Date()) throw new SecretNotConfiguredError(req.connector, "expired");
    const used = all ? rows : rows.slice(0, 1);
    const id = rows[0].credential_id as string;
    await appendAudit(tx, ctx, { action: "secrets.credential.use", resource: "secrets.credential", resourceId: id, after: { connector: req.connector, purpose: req.purpose, versions: used.map((r) => Number(r.version)) } });
    await tx.execute(sql`update secrets.credential set last_used_at = now(), last_used_by = ${ctx.actor.id}, last_used_purpose = ${req.purpose} where id = ${id}`);
    const key = await dataKeyFor(tx, ctx.tenantId);
    return used.map((r) => new TextDecoder().decode(open(key, r.ciphertext as string, valueAad(ctx.tenantId, id, Number(r.version)))));
  });
}

async function run<T>(ctx: ServiceContext, raw: SecretUse, all: boolean, fn: (secrets: Secret[]) => Promise<T>): Promise<T> {
  const req = useInput.parse(raw);
  const values = await load(ctx, req, all);
  const forms = values.flatMap(formsOf);
  let result: T;
  try {
    result = await fn(values.map((v) => new Secret(v)));
  } catch (e) {
    throw scrubError(e, forms);
  }
  return assertNoLeak(result, forms, req.connector);
}

export const useSecret = <T>(ctx: ServiceContext, req: SecretUse, fn: (secret: Secret) => Promise<T>) => run(ctx, req, false, ([s]) => fn(s));

export const useValidSecrets = <T>(ctx: ServiceContext, req: SecretUse, fn: (secrets: Secret[]) => Promise<T>) => run(ctx, req, true, fn);
