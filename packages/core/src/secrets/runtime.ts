import { sql } from "drizzle-orm";
import type { Tx } from "@amax/db";
import type { Kms } from "../adapters/kms";
import { newDataKey } from "./crypto";

const CACHE_MS = 5 * 60_000;
let kms: Kms | null = null;
const cache = new Map<string, { key: Uint8Array; until: number }>();

export class SecretsUnavailableError extends Error {
  readonly retryable = false;
  constructor(why = "no key service is configured (set AMAX_KMS)") {
    super(`secrets: ${why}; connector credentials can't be stored or used`);
    this.name = "SecretsUnavailableError";
  }
}

export function configureSecrets(opts: { kms: Kms | null }) {
  kms = opts.kms;
  cache.clear();
}

export const kmsLabel = () => kms?.label ?? null;

function requireKms(): Kms {
  if (!kms) throw new SecretsUnavailableError();
  return kms;
}

async function create(tx: Tx, k: Kms, tenantId: string) {
  const w = await k.wrap(tenantId, newDataKey());
  await tx.execute(sql`insert into secrets.data_key (tenant_id, kms, key_ref, wrapped) values (${tenantId}, ${k.id}, ${w.keyRef}, ${w.wrapped}) on conflict do nothing`);
}

const storedRow = async (tx: Tx, tenantId: string) =>
  (await tx.execute(sql`select kms, key_ref, wrapped, coalesce(xmin = pg_current_xact_id_if_assigned()::xid, false) as uncommitted from secrets.data_key where tenant_id = ${tenantId}`))[0];

export async function dataKeyFor(tx: Tx, tenantId: string): Promise<Uint8Array> {
  const k = requireKms();
  const hit = cache.get(tenantId);
  if (hit && hit.until > Date.now()) return hit.key;
  let row = await storedRow(tx, tenantId);
  if (!row) {
    await create(tx, k, tenantId);
    row = await storedRow(tx, tenantId);
  }
  if (row.kms !== k.id) throw new SecretsUnavailableError(`this tenant's data key is held by the ${row.kms} key service, but AMAX_KMS is ${k.id}`);
  const key = await k.unwrap(tenantId, { keyRef: row.key_ref as string, wrapped: row.wrapped as string });
  if (!row.uncommitted) cache.set(tenantId, { key, until: Date.now() + CACHE_MS });
  return key;
}
