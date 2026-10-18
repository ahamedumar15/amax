import { sql } from "drizzle-orm";
import { z } from "zod";
import type { Tx } from "@amax/db";
import type { ServiceContext } from "../authorize";
import { defineService } from "../service";
import { CONNECTOR_IDS, type ConnectorId } from "./connectors";
import { open } from "./crypto";
import { valueAad } from "./manage";
import { dataKeyFor } from "./runtime";
import { checkedCopy, scrubError, Secret } from "./secret";

export type SecretUse = { connector: ConnectorId; purpose: string };
export const useAction = (connector: ConnectorId) => `secrets:use:${connector}`;

export class SecretNotConfiguredError extends Error {
  readonly retryable = false;
  constructor(connector: string, why: "missing" | "expired") {
    super(why === "expired" ? `secrets: the ${connector} credential has expired; an Admin must rotate it` : `secrets: no active ${connector} credential; an Admin must add one`);
    this.name = "SecretNotConfiguredError";
  }
}

/** Whether the tenant has a usable credential for the connector, without opening it (060 AC-7). */
export async function hasSecret(tx: Tx, connector: ConnectorId): Promise<boolean> {
  const [r] = await tx.execute(sql`select exists (select 1 from secrets.credential c join secrets.version v on v.credential_id = c.id
    where c.connector = ${connector} and c.revoked_at is null and v.revoked_at is null and (v.valid_until is null or v.valid_until > now())
      and (c.expires_at is null or c.expires_at > now())) as ok`);
  return r?.ok === true;
}

async function openVersions(tx: Tx, tenantId: string, connector: ConnectorId, all: boolean) {
  const rows = await tx.execute(sql`select c.id as credential_id, c.expires_at, v.version, v.ciphertext from secrets.credential c
    join secrets.version v on v.credential_id = c.id
    where c.connector = ${connector} and c.revoked_at is null and v.revoked_at is null and (v.valid_until is null or v.valid_until > now())
    order by v.version desc`);
  if (!rows.length) throw new SecretNotConfiguredError(connector, "missing");
  const expires = rows[0].expires_at as Date | string | null;
  if (expires && new Date(expires) <= new Date()) throw new SecretNotConfiguredError(connector, "expired");
  const id = rows[0].credential_id as string;
  const key = await dataKeyFor(tx, tenantId);
  const used = all ? rows : rows.slice(0, 1);
  return { id, versions: used.map((r) => Number(r.version)), values: used.map((r) => new TextDecoder().decode(open(key, r.ciphertext as string, valueAad(tenantId, id, Number(r.version))))) };
}

const recorderFor = (connector: ConnectorId) => defineService({
  name: "secrets.credential.use",
  action: useAction(connector),
  resource: "secrets.credential",
  keyless: true,
  input: z.object({ purpose: z.string().trim().min(1).max(120), all: z.boolean() }),
  async run(tx, input, ctx) {
    const { id, versions, values } = await openVersions(tx, ctx.tenantId, connector, input.all);
    await tx.execute(sql`update secrets.credential set last_used_at = now(), last_used_by = ${ctx.actor.id}, last_used_purpose = ${input.purpose} where id = ${id}`);
    return { result: values, resourceId: id, after: { connector, purpose: input.purpose, versions } };
  },
});

const recorders = Object.fromEntries(CONNECTOR_IDS.map((c) => [c, recorderFor(c)])) as Record<ConnectorId, ReturnType<typeof recorderFor>>;

async function run<T>(ctx: ServiceContext, req: SecretUse, all: boolean, fn: (secrets: Secret[]) => Promise<T>): Promise<T> {
  const recorder = recorders[z.enum(CONNECTOR_IDS).parse(req.connector)];
  const values = await recorder(ctx, { purpose: req.purpose, all });
  let result: T;
  try {
    result = await fn(values.map((v) => new Secret(v)));
  } catch (e) {
    throw scrubError(e, values);
  }
  return checkedCopy(result, values, req.connector);
}

export const useSecret = <T>(ctx: ServiceContext, req: SecretUse, fn: (secret: Secret) => Promise<T>) => run(ctx, req, false, ([s]) => fn(s));

export const useValidSecrets = <T>(ctx: ServiceContext, req: SecretUse, fn: (secrets: Secret[]) => Promise<T>) => run(ctx, req, true, fn);
