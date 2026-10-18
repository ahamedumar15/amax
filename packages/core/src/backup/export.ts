import { sql } from "drizzle-orm";
import { z } from "zod";
import { defineService } from "../service";
import { assertAdminPerson, BackupError, personOf } from "./catalog";
import { backupConfig } from "./config";

const id = z.object({ id: z.uuid() });

/** AC-4: an Admin asks for the whole tenant; nothing is built until a second Admin approves. */
export const requestExport = defineService({
  name: "backup.export.request",
  action: "backup:manage",
  resource: "backup.export",
  input: z.object({ reason: z.string().min(3).max(500) }),
  async run(tx, input, ctx) {
    assertAdminPerson(ctx, "ask for a tenant export");
    const [open] = await tx.execute(sql`select id from backup.export where status in ('awaiting_approval', 'building') limit 1`);
    if (open) throw new BackupError("a tenant export is already waiting for approval or being built");
    const [r] = await tx.execute(sql`insert into backup.export (tenant_id, reason, requested_by) values (${ctx.tenantId}, ${input.reason}, ${personOf(ctx)}) returning id`);
    const after = { status: "awaiting_approval", reason: input.reason };
    return { result: { id: r.id as string, ...after }, resourceId: r.id as string, after, events: [{ name: "backup.export.requested", payload: { id: r.id } }] };
  },
});

/** AC-4: a different Admin approves; the build runs as a 029 workflow started in this write. */
export const approveExport = defineService({
  name: "backup.export.approve",
  action: "backup:manage",
  resource: "backup.export",
  input: id,
  async run(tx, input, ctx) {
    assertAdminPerson(ctx, "approve a tenant export");
    const [e] = await tx.execute(sql`select status, requested_by from backup.export where id = ${input.id} for update`);
    if (!e) throw new BackupError(`tenant export ${input.id} not found`);
    if (e.status !== "awaiting_approval") throw new BackupError(`this export is ${String(e.status).replace("_", " ")}, not awaiting approval`);
    if (e.requested_by === personOf(ctx)) throw new BackupError("a second Admin must approve: whoever asks for an export can't also approve it");
    const start = backupConfig().start;
    if (!start) throw new BackupError("no workflow engine is configured to build the export");
    await tx.execute(sql`update backup.export set status = 'building', approved_by = ${personOf(ctx)}, approved_at = now() where id = ${input.id}`);
    const runId = await start(ctx.tenantId, "core.tenant-export", { exportId: input.id }, { key: `export:${input.id}`, startedBy: personOf(ctx), tx });
    const after = { status: "building", runId };
    return { result: { id: input.id, ...after }, resourceId: input.id, before: { status: "awaiting_approval" }, after, events: [{ name: "backup.export.approved", payload: { id: input.id } }] };
  },
});

export const cancelExport = defineService({
  name: "backup.export.cancel",
  action: "backup:manage",
  resource: "backup.export",
  input: id,
  async run(tx, input, ctx) {
    assertAdminPerson(ctx, "cancel a tenant export");
    const [r] = await tx.execute(sql`update backup.export set status = 'cancelled' where id = ${input.id} and status = 'awaiting_approval' returning id`);
    if (!r) throw new BackupError("only an export still awaiting approval can be cancelled");
    return { result: { id: input.id, status: "cancelled" }, resourceId: input.id, before: { status: "awaiting_approval" }, after: { status: "cancelled" } };
  },
});

/** Each download through the signed link is counted and audited. */
export const recordDownload = defineService({
  name: "backup.export.download",
  action: "backup:manage",
  resource: "backup.export",
  input: id,
  async run(tx, input) {
    const [r] = await tx.execute(sql`update backup.export set downloads = downloads + 1 where id = ${input.id} and status = 'ready' and expires_at > now() returning storage_key, downloads`);
    if (!r?.storage_key) throw new BackupError("this export's link has expired");
    return { result: { storageKey: r.storage_key as string }, resourceId: input.id, after: { downloads: Number(r.downloads) } };
  },
});
