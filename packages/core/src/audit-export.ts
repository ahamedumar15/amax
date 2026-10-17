import { sql } from "drizzle-orm";
import type { Tx } from "@amax/db";
import type { Storage } from "./adapters/storage";
import { canonical, verifyAuditChain } from "./audit";
import type { JobDef } from "./module";

const DAY = 86_400_000;
const isoDay = (d: Date) => d.toISOString().slice(0, 10);

// Writes one tenant's audit rows for one UTC day as NDJSON, plus a trailer line with the chain
// head and its verification, as a write-once object.
export async function exportAuditDay(tx: Tx, tenantId: string, day: Date, storage: Storage, retentionDays: number) {
  const from = new Date(`${isoDay(day)}T00:00:00Z`);
  const to = new Date(from.getTime() + DAY);
  const rows = await tx.execute(sql`select * from core.audit_event
    where tenant_id = ${tenantId} and occurred_at >= ${from.toISOString()} and occurred_at < ${to.toISOString()} order by seq`);
  const chain = await verifyAuditChain(tx, tenantId);
  const trailer = { $export: { tenantId, day: isoDay(from), rows: rows.length, chain } };
  const body = [...rows.map((r) => canonical(r)), canonical(trailer)].join("\n") + "\n";
  const key = `audit/${tenantId}/${isoDay(from).replaceAll("-", "/")}.ndjson`;
  await storage.put(key, body, { contentType: "application/x-ndjson", retainUntil: new Date(to.getTime() + retentionDays * DAY) });
  return { key, rows: rows.length, chainOk: chain.ok };
}

// Runs daily per tenant (00:15 UTC) and exports the previous day.
export const auditExportJob = (getStorage: () => Storage | null, retentionDays = 2555): JobDef => ({
  name: "core.audit.export",
  cron: "15 0 * * *",
  async run({ tx, tenantId }) {
    const storage = getStorage();
    if (!storage) throw new Error("audit export: object storage is not configured (S3_ENDPOINT, S3_BUCKET, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY)");
    await exportAuditDay(tx, tenantId, new Date(Date.now() - DAY), storage, retentionDays);
  },
});
