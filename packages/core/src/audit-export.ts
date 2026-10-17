import { sql, type SQL } from "drizzle-orm";
import type { Tx } from "@amax/db";
import type { Storage } from "./adapters/storage";
import { appendAudit, canonical, verifyAuditChain, type ChainResult } from "./audit";
import { contextFor } from "./authorize";
import type { JobDef } from "./module";
import { verifyTraceChain } from "./trace";

const DAY = 86_400_000;
const isoDay = (d: Date) => d.toISOString().slice(0, 10);

type Part = { prefix: string; rows: (from: string, to: string) => SQL; chain?: (tx: Tx, tenantId: string) => Promise<ChainResult> };

// 050: the trace chain and the AI call log are exported beside the audit, each as its own object.
const PARTS: Part[] = [
  { prefix: "audit", rows: (f, t) => sql`select * from core.audit_event where occurred_at >= ${f} and occurred_at < ${t} order by seq`, chain: verifyAuditChain },
  { prefix: "trace", rows: (f, t) => sql`select * from core.trace_event where occurred_at >= ${f} and occurred_at < ${t} order by seq`, chain: verifyTraceChain },
  { prefix: "ai-call", rows: (f, t) => sql`select * from ai.call where at >= ${f} and at < ${t} order by at, id` },
];

function trailerOf(key: string, body: Uint8Array) {
  const last = new TextDecoder().decode(body).trimEnd().split("\n").at(-1) ?? "";
  try {
    const t = (JSON.parse(last) as { $export?: { rows?: number; chain?: ChainResult } }).$export;
    if (t) return { key, rows: Number(t.rows ?? 0), chainOk: t.chain?.ok ?? true };
  } catch { /* fall through */ }
  return { key, rows: 0, chainOk: false };
}

// Writes one tenant's rows for one UTC day as NDJSON, plus a trailer line with the chain head and
// its verification, as write-once objects; then records the export itself in the audit.
export async function exportAuditDay(tx: Tx, tenantId: string, day: Date, storage: Storage, retentionDays: number) {
  const from = new Date(`${isoDay(day)}T00:00:00Z`);
  const to = new Date(from.getTime() + DAY);
  const retainUntil = new Date(to.getTime() + retentionDays * DAY);
  // One export of a (tenant, day) at a time, so overlapping runs can't both record it (052 review).
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`core.audit.export:${tenantId}:${isoDay(from)}`}))`);
  const out: { key: string; rows: number; chainOk: boolean; existing?: true }[] = [];
  for (const part of PARTS) {
    const key = `${part.prefix}/${tenantId}/${isoDay(from).replaceAll("-", "/")}.ndjson`;
    // Write-once: a retry after a later object failed finds the earlier ones already locked. Those
    // stand as written (their trailer says what they hold); only the missing ones are put (052 review).
    const prior = await storage.get(key);
    if (prior) {
      out.push({ ...trailerOf(key, prior), existing: true });
      continue;
    }
    const rows = await tx.execute(sql`select * from (${part.rows(from.toISOString(), to.toISOString())}) r where r.tenant_id = ${tenantId}`);
    const chain = part.chain ? await part.chain(tx, tenantId) : null;
    const trailer = { $export: { tenantId, day: isoDay(from), rows: rows.length, ...(chain ? { chain } : {}) } };
    const body = [...rows.map((r) => canonical(r)), canonical(trailer)].join("\n") + "\n";
    await storage.put(key, body, { contentType: "application/x-ndjson", retainUntil });
    out.push({ key, rows: rows.length, chainOk: chain?.ok ?? true });
  }
  // A re-run that found every object already written records nothing new if the day's export row
  // is there (one row per exported day); otherwise this is the run that completes it (052 review).
  const [done] = out.every((o) => o.existing)
    ? await tx.execute(sql`select 1 from core.audit_event where tenant_id = ${tenantId} and action = 'core.audit.export' and resource_id = ${isoDay(from)} limit 1`)
    : [];
  if (!done) await appendAudit(tx, contextFor.job(tenantId, "core.audit.export"), {
    action: "core.audit.export", resource: "core.audit_export", resourceId: isoDay(from),
    after: { day: isoDay(from), retainUntil: retainUntil.toISOString(), objects: out },
  });
  const [audit] = out;
  return { ...audit, chainOk: out.every((o) => o.chainOk), objects: out };
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
