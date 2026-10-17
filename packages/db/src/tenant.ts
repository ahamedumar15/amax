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
