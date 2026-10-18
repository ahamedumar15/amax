import { sql } from "drizzle-orm";
import { z } from "zod";
import { defineService } from "../service";
import { BackupError, personOf, TARGETS } from "./catalog";

/** AC-3: an Admin asks for a drill now; the drill runner picks it up on its next pass. */
export const requestDrill = defineService({
  name: "backup.drill.request",
  action: "backup:manage",
  resource: "backup.drill",
  input: z.object({}),
  async run(tx, _input, ctx) {
    const [open] = await tx.execute(sql`select id from backup.drill where status = 'requested' limit 1`);
    if (open) throw new BackupError("a restore drill is already waiting to run");
    const [snap] = await tx.execute(sql`select 1 from backup.snapshot where pruned_at is null limit 1`);
    if (!snap) throw new BackupError("there is no backup to drill yet: the first snapshot runs tonight");
    const [r] = await tx.execute(sql`insert into backup.drill (tenant_id, requested_by) values (${ctx.tenantId}, ${personOf(ctx)}) returning id`);
    return { result: { id: r.id as string, status: "requested" }, resourceId: r.id as string, after: { status: "requested" } };
  },
});

const Mismatch = z.object({ table: z.string(), expected: z.number(), restored: z.number() });
const Outcome = z.object({
  drillId: z.uuid().nullable(),
  snapshotId: z.uuid().nullable(),
  backupTakenAt: z.string().nullable(),
  startedAt: z.string(),
  durationMs: z.number().int().nonnegative(),
  tablesChecked: z.number().int().nonnegative(),
  rowsChecked: z.number().int().nonnegative(),
  mismatches: z.array(Mismatch),
  chainOk: z.boolean().nullable(),
  chainLength: z.number().int().nonnegative().nullable(),
  error: z.string().max(500).nullable(),
});
export type DrillOutcome = z.infer<typeof Outcome>;

/** Passed, slow (over an hour, a quarter of the 4 h target) or failed: a count, the chain, an error or the target. */
export function drillStatus(o: DrillOutcome): { status: "passed" | "slow" | "failed"; note: string | null } {
  if (o.error) return { status: "failed", note: o.error };
  if (o.mismatches.length) return { status: "failed", note: `${o.mismatches.length} tables restored a different row count` };
  if (o.chainOk === false) return { status: "failed", note: "the restored audit chain doesn't verify" };
  const minutes = o.durationMs / 60_000;
  if (minutes > TARGETS.rtoMinutes) return { status: "failed", note: "slower than the 4 hour recovery time" };
  if (minutes > TARGETS.slowMinutes) return { status: "slow", note: "slower than an hour" };
  return { status: "passed", note: null };
}

/** AC-3: the drill runner records what it restored and checked, audited as the drill job. */
export const recordDrill = defineService({
  name: "backup.drill.record",
  action: "backup:drill",
  resource: "backup.drill",
  input: Outcome,
  async run(tx, o, ctx) {
    const { status, note } = drillStatus(o);
    const v = sql`${o.snapshotId}, ${o.backupTakenAt}, ${o.startedAt}, now(), ${o.durationMs}, ${o.tablesChecked}, ${o.rowsChecked}, ${JSON.stringify(o.mismatches)}::jsonb, ${o.chainOk}, ${o.chainLength}, ${note}`;
    const [r] = o.drillId
      ? await tx.execute(sql`update backup.drill set (status, snapshot_id, backup_taken_at, started_at, finished_at, duration_ms, tables_checked, rows_checked, mismatches, chain_ok, chain_length, note)
          = (${status}, ${v}) where id = ${o.drillId} and status = 'requested' returning id`)
      : await tx.execute(sql`insert into backup.drill (tenant_id, requested_by, status, snapshot_id, backup_taken_at, started_at, finished_at, duration_ms, tables_checked, rows_checked, mismatches, chain_ok, chain_length, note)
          values (${ctx.tenantId}, ${personOf(ctx)}, ${status}, ${v}) returning id`);
    if (!r) throw new BackupError(`restore drill ${o.drillId} isn't waiting to run`);
    const after = { status, durationMs: o.durationMs, rowsChecked: o.rowsChecked, chainOk: o.chainOk, mismatches: o.mismatches.length };
    return { result: { id: r.id as string, status }, resourceId: r.id as string, after, events: [{ name: "backup.drill.finished", payload: { id: r.id, ...after } }] };
  },
});
