import { sql } from "drizzle-orm";
import type { FixtureSeed } from "@amax/core";

const DRILLS = [
  ["2026-10-11T02:00:00Z", "2026-10-11T03:00:00Z", 38, 4_212_480, "passed", null],
  ["2026-10-04T02:00:00Z", "2026-10-04T03:00:00Z", 41, 4_137_902, "passed", null],
  ["2026-09-27T02:00:00Z", "2026-09-27T03:00:00Z", 72, 4_101_355, "slow", "slower than an hour"],
] as const;

// 034: the Backups and export screen's history, as in its mock (fictional). Drill rows and exports only:
// no snapshot rows, so nothing claims a backup file that isn't there.
export const backupFixtures: FixtureSeed = async ({ tx, tenantId }) => {
  const [seeded] = await tx.execute(sql`select 1 from backup.drill limit 1`);
  if (seeded) return;
  const id = async (email: string) => (await tx.execute(sql`select id from auth.user where email = ${email}`))[0]?.id as string | undefined;
  const [maya, sahan] = [await id("maya@lumenlabs.test"), await id("sahan@lumenlabs.test")];
  if (!maya || !sahan) return;
  for (const [from, at, minutes, rows, status, note] of DRILLS) {
    await tx.execute(sql`insert into backup.drill (tenant_id, status, requested_by, requested_at, backup_taken_at, started_at, finished_at, duration_ms, tables_checked, rows_checked, chain_ok, chain_length, note)
      values (${tenantId}, ${status}, 'job:core.restore-drill', ${at}, ${from}, ${at}, ${at}::timestamptz + make_interval(mins => ${minutes}), ${minutes * 60_000}, 64, ${rows}, true, 18402, ${note})`);
  }
  await tx.execute(sql`insert into backup.export (tenant_id, status, reason, requested_by, requested_at, approved_by, approved_at, ready_at, expires_at, modules, files, bytes)
    values (${tenantId}, 'ready', 'Quarterly archive (fictional)', ${`user:${maya}`}, '2026-09-02T04:10:00Z', ${`user:${sahan}`}, '2026-09-02T05:00:00Z', '2026-09-02T05:20:00Z', '2026-09-03T05:20:00Z',
      ${JSON.stringify(Object.fromEntries(Array.from({ length: 18 }, (_, i) => [`module_${i + 1}`, {}])))}::jsonb, 212, 0)`);
  await tx.execute(sql`insert into backup.export (tenant_id, reason, requested_by, requested_at) values (${tenantId}, 'Board audit pack (fictional)', ${`user:${sahan}`}, '2026-10-17T03:30:00Z')`);
};
