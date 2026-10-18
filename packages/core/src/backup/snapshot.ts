import { sql } from "drizzle-orm";
import { z } from "zod";
import type { Tx } from "@amax/db";
import type { ServiceContext } from "../authorize";
import { defineService } from "../service";
import { open, seal } from "../secrets/crypto";
import { dataKeyFor } from "../secrets/runtime";
import { BackupError, TARGETS } from "./catalog";
import { backupConfig } from "./config";
import { tableRows, tenantTables, type TableRef } from "./tables";

const encoder = new TextEncoder();
export const snapshotKey = (tenantId: string, id: string, table: string) => `backups/${tenantId}/${id}/${table}.json.sealed`;
const aad = (tenantId: string, id: string, table: string) => `amax-backup:${tenantId}:${id}:${table}`;

/** AC-2 (033): the tenant's storage region, else its data region; null when it has chosen none. */
export async function tenantRegion(tx: Tx): Promise<string | null> {
  const [r] = await tx.execute(sql`select coalesce(storage_region, data_region) as region from ai.settings limit 1`);
  return (r?.region as string | null | undefined) ?? null;
}

export async function regionStorage(tx: Tx) {
  const region = await tenantRegion(tx);
  const storage = backupConfig().storageFor(region);
  if (!storage) throw new BackupError(region ? `no backup storage is configured in the tenant's data region (${region})` : "no backup storage is configured (AMAX_BACKUP_DIR or S3_BACKUP_BUCKET)");
  return { region, storage };
}

export function sealJson(key: Uint8Array, value: unknown, tenantId: string, id: string, table: string) {
  return seal(key, encoder.encode(JSON.stringify(value)), aad(tenantId, id, table));
}

export function openJson<T>(key: Uint8Array, sealed: Uint8Array, tenantId: string, id: string, table: string): T {
  return JSON.parse(new TextDecoder().decode(open(key, new TextDecoder().decode(sealed), aad(tenantId, id, table)))) as T;
}

async function writeTables(tx: Tx, ctx: ServiceContext, id: string, tables: TableRef[]) {
  const { region, storage } = await regionStorage(tx);
  const key = await dataKeyFor(tx, ctx.tenantId);
  const counts: Record<string, number> = {};
  let bytes = 0;
  for (const t of tables) {
    const rows = await tableRows(tx, t, "snapshot");
    const body = sealJson(key, rows, ctx.tenantId, id, t.name);
    await storage.put(snapshotKey(ctx.tenantId, id, t.name), body, { contentType: "application/octet-stream" });
    counts[t.name] = rows.length;
    bytes += body.length;
  }
  return { region, counts, bytes };
}

/** AC-2: one encrypted snapshot of the tenant, JSON per table sealed with its data key (031). */
export const takeSnapshot = defineService({
  name: "backup.snapshot.take",
  action: "backup:snapshot",
  resource: "backup.snapshot",
  input: z.object({ kind: z.enum(["daily", "monthly"]) }),
  async run(tx, input, ctx) {
    const [{ id }] = (await tx.execute(sql`select gen_random_uuid()::text as id`)) as { id: string }[];
    const { region, counts, bytes } = await writeTables(tx, ctx, id, await tenantTables(tx, "snapshot"));
    const keep = input.kind === "monthly" ? `P${TARGETS.monthlyKept}M` : `P${TARGETS.dailyDays}D`;
    const rows = Object.values(counts).reduce((a, b) => a + b, 0);
    await tx.execute(sql`insert into backup.snapshot (id, tenant_id, kind, region, storage_key, tables, row_count, bytes, expires_at)
      values (${id}, ${ctx.tenantId}, ${input.kind}, ${region}, ${`backups/${ctx.tenantId}/${id}/`}, ${JSON.stringify(counts)}::jsonb, ${rows}, ${bytes}, now() + ${keep}::interval)`);
    const after = { kind: input.kind, region, tables: Object.keys(counts).length, rows, bytes };
    return { result: { id, ...after }, resourceId: id, after, events: [{ name: "backup.snapshot.taken", payload: { id, ...after } }] };
  },
});

/** Monthly on the first snapshot of a month, daily otherwise. */
export async function snapshotKind(tx: Tx): Promise<"daily" | "monthly"> {
  const [r] = await tx.execute(sql`select 1 from backup.snapshot where kind = 'monthly' and taken_at >= date_trunc('month', now()) limit 1`);
  return r ? "daily" : "monthly";
}
