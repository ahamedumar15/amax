import { sql } from "drizzle-orm";
import type { Tx } from "@amax/db";
import { newDataKey } from "./crypto";
import type { Kms } from "../adapters/kms";

const CACHE_MS = 5 * 60_000;
let kms: Kms | null = null;
const cache = new Map<string, { key: Uint8Array; until: number }>();

export class SecretsUnavailableError extends Error {
  readonly retryable = false;
  constructor() {
    super("secrets: no key service is configured (set AMAX_KMS); connector credentials can't be stored or used");
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
  const key = newDataKey();
  const w = await k.wrap(tenantId, key);
  await tx.execute(sql`insert into secrets.data_key (tenant_id, kms, key_ref, wrapped) values (${tenantId}, ${k.id}, ${w.keyRef}, ${w.wrapped}) on conflict do nothing`);
}

export async function dataKeyFor(tx: Tx, tenantId: string): Promise<Uint8Array> {
  const k = requireKms();
  const hit = cache.get(tenantId);
  if (hit && hit.until > Date.now()) return hit.key;
  let [row] = await tx.execute(sql`select key_ref, wrapped from secrets.data_key where tenant_id = ${tenantId}`);
  if (!row) {
    await create(tx, k, tenantId);
    [row] = await tx.execute(sql`select key_ref, wrapped from secrets.data_key where tenant_id = ${tenantId}`);
  }
  const key = await k.unwrap(tenantId, { keyRef: row.key_ref as string, wrapped: row.wrapped as string });
  cache.set(tenantId, { key, until: Date.now() + CACHE_MS });
  return key;
}
