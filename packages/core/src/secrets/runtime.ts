import { sql } from "drizzle-orm";
import type { Tx } from "@amax/db";
import type { Kms } from "../adapters/kms";

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

export function requireKms(): Kms {
  if (!kms) throw new SecretsUnavailableError();
  return kms;
}

export async function dataKeyFor(tx: Tx, tenantId: string): Promise<Uint8Array> {
  const k = requireKms();
  const hit = cache.get(tenantId);
  if (hit && hit.until > Date.now()) return hit.key;
  const [row] = await tx.execute(sql`select kms, key_ref, wrapped from secrets.data_key where tenant_id = ${tenantId}`);
  if (!row) throw new SecretsUnavailableError("this tenant has no data key yet");
  if (row.kms !== k.id) throw new SecretsUnavailableError(`this tenant's data key is held by the ${row.kms} key service, but AMAX_KMS is ${k.id}`);
  const key = await k.unwrap(tenantId, { keyRef: row.key_ref as string, wrapped: row.wrapped as string });
  cache.set(tenantId, { key, until: Date.now() + CACHE_MS });
  return key;
}
