import { sql } from "drizzle-orm";
import type { Db, Tx } from "./client";

// Every tenant-owned table has RLS keyed on app.tenant_id; set it for this transaction only.
export async function setTenant(tx: Tx, tenantId: string) {
  await tx.execute(sql`select set_config('app.tenant_id', ${tenantId}, true)`);
}

export function withTenant<T>(db: Db, tenantId: string, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return db.transaction(async (tx) => {
    await setTenant(tx, tenantId);
    return fn(tx);
  });
}

// Arrays go to Postgres as one bound JSON parameter, never as a hand-built array literal, so no
// value can change the array's shape (review round 1).
// The trailing cast makes it an array expression, so it also works inside any(...).
export const textArray = (xs: string[]) => sql`(select coalesce(array_agg(x), '{}') from jsonb_array_elements_text(${JSON.stringify(xs)}::jsonb) x)::text[]`;
export const uuidArray = (xs: string[]) => sql`(select coalesce(array_agg(x::uuid), '{}') from jsonb_array_elements_text(${JSON.stringify(xs)}::jsonb) x)::uuid[]`;
