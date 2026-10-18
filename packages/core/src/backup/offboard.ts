import { sql } from "drizzle-orm";
import { z } from "zod";
import type { Tx } from "@amax/db";
import { defineService } from "../service";
import { forgetDataKey } from "../secrets/runtime";
import { assertAdminPerson, BackupError, personOf, TARGETS } from "./catalog";
import { backupConfig } from "./config";

/**
 * AC-5: a tenant leaving amax. The offboarding offers a whole-tenant export (awaiting a second Admin),
 * then a 029 workflow waits 30 days and destroys the tenant's data key, so its snapshots can't be read.
 */
export const startOffboarding = defineService({
  name: "backup.offboarding.start",
  action: "backup:manage",
  resource: "backup.offboarding",
  input: z.object({ reason: z.string().min(3).max(500) }),
  async run(tx, input, ctx) {
    assertAdminPerson(ctx, "start offboarding");
    const start = backupConfig().start;
    if (!start) throw new BackupError("no workflow engine is configured to run the offboarding");
    const [open] = await tx.execute(sql`select id from backup.offboarding where status = 'waiting'`);
    if (open) throw new BackupError("this tenant is already leaving amax");
    const [prior] = await tx.execute(sql`select id from backup.export where status in ('awaiting_approval', 'building') limit 1`);
    const [made] = prior ? [prior] : await tx.execute(sql`insert into backup.export (tenant_id, reason, requested_by) values (${ctx.tenantId}, ${"Offered when the tenant started leaving amax"}, ${personOf(ctx)}) returning id`);
    const [o] = await tx.execute(sql`insert into backup.offboarding (tenant_id, reason, started_by, destroy_after, export_id)
      values (${ctx.tenantId}, ${input.reason}, ${personOf(ctx)}, now() + make_interval(days => ${TARGETS.waitDays}), ${made.id}) returning id, destroy_after`);
    const runId = await start(ctx.tenantId, "core.tenant-offboarding", { offboardingId: o.id as string }, { key: `offboarding:${o.id}`, startedBy: personOf(ctx), tx });
    const after = { status: "waiting", destroyAfter: new Date(o.destroy_after as string).toISOString(), exportId: made.id as string, runId };
    return { result: { id: o.id as string, ...after }, resourceId: o.id as string, after, events: [{ name: "backup.offboarding.started", payload: { id: o.id, destroyAfter: after.destroyAfter } }] };
  },
});

export const cancelOffboarding = defineService({
  name: "backup.offboarding.cancel",
  action: "backup:manage",
  resource: "backup.offboarding",
  input: z.object({ id: z.uuid() }),
  async run(tx, input, ctx) {
    assertAdminPerson(ctx, "cancel offboarding");
    const [r] = await tx.execute(sql`update backup.offboarding set status = 'cancelled', cancelled_by = ${personOf(ctx)}, cancelled_at = now() where id = ${input.id} and status = 'waiting' returning id`);
    if (!r) throw new BackupError("only a waiting offboarding can be cancelled; the data key is already destroyed or it was cancelled");
    return { result: { id: input.id, status: "cancelled" }, resourceId: input.id, before: { status: "waiting" }, after: { status: "cancelled" }, events: [{ name: "backup.offboarding.cancelled", payload: { id: input.id } }] };
  },
});

/** Where the offboarding stands for its workflow: wait, hold (a legal hold is active), stop, or destroy. */
export async function offboardingState(tx: Tx, id: string) {
  const [o] = await tx.execute(sql`select status, destroy_after, (select count(*)::int from privacy.legal_hold where released_at is null) as holds from backup.offboarding where id = ${id}`);
  if (!o || o.status !== "waiting") return { next: "stop" as const, status: (o?.status as string | undefined) ?? "missing" };
  const waitMs = Math.max(0, new Date(o.destroy_after as string).getTime() - Date.now());
  return { next: waitMs > 0 ? ("wait" as const) : Number(o.holds) > 0 ? ("hold" as const) : ("destroy" as const), waitMs, status: "waiting" };
}

/** The destroy goes through the database gate (0030), which checks the 30 days and legal holds again. */
export const destroyDataKey = defineService({
  name: "backup.data_key.destroy",
  action: "backup:snapshot",
  resource: "secrets.data_key",
  input: z.object({ id: z.uuid() }),
  async run(tx, input, ctx) {
    await tx.execute(sql`select backup.destroy_data_key(${input.id})`);
    forgetDataKey(ctx.tenantId);
    return { result: { id: input.id, status: "destroyed" }, resourceId: input.id, before: { status: "waiting" }, after: { status: "destroyed" }, events: [{ name: "backup.data_key.destroyed", payload: { id: input.id } }] };
  },
});
