import { sql } from "drizzle-orm";
import type { Tx } from "@amax/db";

export type SyncProblem = { key: string; kind: "refused" | "unmatched" | "invalid"; personId?: string | null; personName?: string | null; externalRef?: string | null; message: string };

/** Opens the error, or bumps the open one with the same key: a record that fails every run is one row, not one per run. */
export async function raise(tx: Tx, tenantId: string, runId: string, e: SyncProblem) {
  await tx.execute(sql`insert into keyflow.sync_error (tenant_id, key, kind, person_id, person_name, external_ref, message, last_run_id)
    values (${tenantId}, ${e.key}, ${e.kind}, ${e.personId ?? null}, ${e.personName ?? null}, ${e.externalRef ?? null}, ${e.message}, ${runId})
    on conflict (tenant_id, key) where dismissed_at is null
    do update set runs = keyflow.sync_error.runs + 1, last_seen_at = now(), last_run_id = excluded.last_run_id, message = excluded.message`);
}

/** Closes open errors for records that went through this time (a person Keyflow now accepts). */
export async function resolve(tx: Tx, keys: string[], by: string) {
  if (!keys.length) return;
  await tx.execute(sql`update keyflow.sync_error set dismissed_at = now(), dismissed_by = ${by}
    where dismissed_at is null and key in (${sql.join(keys.map((k) => sql`${k}`), sql`, `)})`);
}
