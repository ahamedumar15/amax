import { sql } from "drizzle-orm";
import { z } from "zod";
import { defineService } from "../service";
import { backupConfig } from "./config";
import { regionStorage, snapshotKey } from "./snapshot";

/**
 * AC-2 (032): snapshots past their keep date and expired export files are removed, except while a
 * legal hold is active: a backup holds every person's data, so any hold keeps them all.
 */
export const pruneBackups = defineService({
  name: "backup.prune",
  action: "backup:snapshot",
  resource: "backup.snapshot",
  input: z.object({}),
  async run(tx, _input, ctx) {
    const [hold] = await tx.execute(sql`select 1 from privacy.legal_hold where released_at is null limit 1`);
    if (hold) return { result: { paused: true, snapshots: 0, exports: 0 }, after: { paused: true } };
    const { storage } = await regionStorage(tx);
    const due = await tx.execute(sql`select id, region, tables from backup.snapshot where pruned_at is null and expires_at < now()`);
    for (const s of due) {
      const where = backupConfig().storageFor((s.region as string | null) ?? null);
      if (!where) continue;
      for (const table of Object.keys(s.tables as Record<string, number>)) await where.delete(snapshotKey(ctx.tenantId, s.id as string, table));
      await tx.execute(sql`update backup.snapshot set pruned_at = now() where id = ${s.id}`);
    }
    const files = await tx.execute(sql`select id, storage_key from backup.export where storage_key is not null and expires_at < now()`);
    for (const e of files) {
      await storage.delete(e.storage_key as string);
      await tx.execute(sql`update backup.export set storage_key = null where id = ${e.id}`);
    }
    const after = { paused: false, snapshots: due.length, exports: files.length };
    return { result: after, after };
  },
});
