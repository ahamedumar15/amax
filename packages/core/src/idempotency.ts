import { AsyncLocalStorage } from "node:async_hooks";
import { sql } from "drizzle-orm";
import type { Tx } from "@amax/db";

// Idempotency keys (review round 7). A caller that may retry a write (the chat's "Add it", after a
// lost reply or a crash) runs it under a key. The first service call in that scope records the key
// in its own transaction, with its result, so the write and the record commit together: a retry
// returns the stored result instead of writing again, and a concurrent second attempt waits on the
// key and then gets the same result. A key can also be claimed as cancelled, which stops the write.

const scope = new AsyncLocalStorage<{ key: string; used: boolean }>();

export const withIdempotency = <T>(key: string, fn: () => Promise<T>) => scope.run({ key, used: false }, fn);

/** The key for the first service call in this scope; nested calls don't get it. */
export function takeIdempotencyKey(): string | null {
  const s = scope.getStore();
  if (!s || s.used) return null;
  s.used = true;
  return s.key;
}

export type KeyOutcome = { result: unknown } | { cancelled: true };

/** The write was cancelled under this key before it ran; it never will. */
export class CancelledByKeyError extends Error {
  readonly retryable = false;
  constructor(key: string) {
    super(`${key} was cancelled`);
    this.name = "CancelledByKeyError";
  }
}

/**
 * Claims `key` in this transaction with `outcome` (null: to be settled before commit). Returns null
 * when claimed, or what an earlier attempt stored. Waits while another transaction holds the key.
 */
export async function claimKey(tx: Tx, tenantId: string, key: string, outcome: KeyOutcome | null): Promise<KeyOutcome | null> {
  const [mine] = await tx.execute(sql`insert into core.idempotency (tenant_id, key, outcome) values (${tenantId}, ${key}, ${JSON.stringify(outcome)}::jsonb)
    on conflict (tenant_id, key) do nothing returning key`);
  if (mine) return null;
  const [row] = await tx.execute(sql`select outcome from core.idempotency where tenant_id = ${tenantId} and key = ${key}`);
  return row.outcome as KeyOutcome;
}

export const settleKey = (tx: Tx, tenantId: string, key: string, outcome: KeyOutcome) =>
  tx.execute(sql`update core.idempotency set outcome = ${JSON.stringify(outcome)}::jsonb where tenant_id = ${tenantId} and key = ${key}`);

/** False for errors a retry can't fix (refused, invalid, cancelled); everything else may be retried. */
export const retryable = (e: unknown) => !(typeof e === "object" && e !== null && (e as { retryable?: unknown }).retryable === false);
