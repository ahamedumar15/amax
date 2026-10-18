import { sql } from "drizzle-orm";
import { withTenant, type Tx } from "@amax/db";
import { authorize, ForbiddenError, type ServiceContext } from "../authorize";
import { getRuntime } from "../service";
import { names } from "../privacy/view";
import { BACKUP_READ, TARGETS } from "./catalog";
import { backupConfig } from "./config";
import { tenantRegion } from "./snapshot";

const iso = (v: unknown) => (v ? new Date(v as string).toISOString() : null);
const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));

export type DrillView = { id: string; status: "requested" | "passed" | "slow" | "failed"; requestedBy: string | null; requestedAt: string; backupTakenAt: string | null; startedAt: string | null; durationMs: number | null; tablesChecked: number | null; rowsChecked: number | null; mismatches: { table: string; expected: number; restored: number }[]; chainOk: boolean | null; chainLength: number | null; note: string | null };
export type ExportView = { id: string; status: string; reason: string; requestedBy: string; requestedAt: string; approvedBy: string | null; approvedAt: string | null; readyAt: string | null; expiresAt: string | null; expired: boolean; modules: number; files: number; bytes: number; downloads: number; error: string | null };
export type OffboardingView = { id: string; status: string; reason: string; startedBy: string; startedAt: string; destroyAfter: string; exportId: string | null; destroyedAt: string | null };

export const toDrill = (r: Record<string, unknown>): DrillView => ({
  id: r.id as string, status: r.status as DrillView["status"], requestedBy: (r.requested_by as string | null) ?? null, requestedAt: iso(r.requested_at)!, backupTakenAt: iso(r.backup_taken_at), startedAt: iso(r.started_at),
  durationMs: num(r.duration_ms), tablesChecked: num(r.tables_checked), rowsChecked: num(r.rows_checked), mismatches: (r.mismatches as DrillView["mismatches"]) ?? [], chainOk: (r.chain_ok as boolean | null) ?? null, chainLength: num(r.chain_length), note: (r.note as string | null) ?? null,
});

export const toExport = (r: Record<string, unknown>): ExportView => ({
  id: r.id as string, status: r.status as string, reason: r.reason as string, requestedBy: r.requested_by as string, requestedAt: iso(r.requested_at)!, approvedBy: (r.approved_by as string | null) ?? null, approvedAt: iso(r.approved_at),
  readyAt: iso(r.ready_at), expiresAt: iso(r.expires_at), expired: r.status === "ready" && (!r.storage_key || new Date(r.expires_at as string).getTime() <= Date.now()),
  modules: Object.keys((r.modules as object) ?? {}).length, files: Number(r.files ?? 0), bytes: Number(r.bytes ?? 0), downloads: Number(r.downloads ?? 0), error: (r.error as string | null) ?? null,
});

const toOffboarding = (r: Record<string, unknown>): OffboardingView => ({
  id: r.id as string, status: r.status as string, reason: r.reason as string, startedBy: r.started_by as string, startedAt: iso(r.started_at)!, destroyAfter: iso(r.destroy_after)!, exportId: (r.export_id as string | null) ?? null, destroyedAt: iso(r.destroyed_at),
});

export async function readBackups<T>(ctx: ServiceContext, fn: (tx: Tx) => Promise<T>): Promise<T> {
  if (!(await authorize(ctx, BACKUP_READ, "backup.snapshot", {}))) throw new ForbiddenError(BACKUP_READ, "backup.snapshot");
  return withTenant(getRuntime().db, ctx.tenantId, fn);
}

export const listDrills = async (tx: Tx, limit = 12) => (await tx.execute(sql`select * from backup.drill order by coalesce(started_at, requested_at) desc limit ${limit}`)).map(toDrill);
export const listExports = async (tx: Tx, limit = 12) => (await tx.execute(sql`select * from backup.export order by (status in ('awaiting_approval', 'building')) desc, requested_at desc limit ${limit}`)).map(toExport);
export const getDrill = async (tx: Tx, id: string) => (await tx.execute(sql`select * from backup.drill where id = ${id}`)).map(toDrill)[0] ?? null;
export const getExport = async (tx: Tx, id: string) => (await tx.execute(sql`select * from backup.export where id = ${id}`)).map(toExport)[0] ?? null;

async function snapshots(tx: Tx) {
  const [r] = await tx.execute(sql`select max(taken_at) as latest, count(*) filter (where kind = 'monthly')::int as monthly, count(*)::int as kept from backup.snapshot where pruned_at is null`);
  return { latest: iso(r?.latest), monthly: Number(r?.monthly ?? 0), kept: Number(r?.kept ?? 0) };
}

/** The Backups and export screen (AC-3, AC-4, AC-6): recovery, drills and exports, attention first. */
export async function backupOverview(ctx: ServiceContext) {
  return readBackups(ctx, async (tx) => {
    const [drills, exports, snaps, region] = [await listDrills(tx), await listExports(tx), await snapshots(tx), await tenantRegion(tx)];
    const [off] = (await tx.execute(sql`select * from backup.offboarding where status = 'waiting' order by started_at desc limit 1`)).map(toOffboarding);
    const storage = backupConfig().storageFor(region);
    const versioned = (await backupConfig().files()?.versioned?.().catch(() => null)) ?? null;
    const people = await names(tx, [...drills.map((d) => d.requestedBy ?? ""), ...exports.flatMap((e) => [e.requestedBy, e.approvedBy ?? ""]), off?.startedBy ?? ""]);
    return { pitr: backupConfig().pitr, targets: TARGETS, region, storage: storage ? "configured" : "missing", versioned, snapshots: snaps, drills, exports, offboarding: off ?? null, names: people };
  });
}
export type BackupOverview = Awaited<ReturnType<typeof backupOverview>>;
