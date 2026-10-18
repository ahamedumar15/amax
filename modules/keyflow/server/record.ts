import { sql } from "drizzle-orm";
import { z } from "zod";
import type { Tx } from "@amax/db";
import { defineService, type ServiceContext } from "@amax/core/server";
import { EVENTS, type RunStatus, type SyncCompleted, type SyncFailed } from "../contracts";
import { applyOutcome, type Outcome } from "./apply";
import { by } from "./context";
import { ChangesReply, PushReply } from "./transport";

// The sync's writes: one service per run, so each run is authorised, audited (counts only, never a
// person's data) and announced. Only the keyflow.sync job calls them.
const sent = z.array(z.object({ kind: z.enum(["person", "team"]), localId: z.string(), hash: z.string() }));
const started = z.iso.datetime();

const recordInput = z.object({ startedAt: started, sent, refused: PushReply.shape.refused, changes: ChangesReply });

/** Writes one run and its outcome in the caller's transaction (the service below, and fixtures). */
export async function writeRun(tx: Tx, ctx: ServiceContext, a: z.infer<typeof recordInput>): Promise<SyncCompleted> {
  const [run] = await tx.execute(sql`insert into keyflow.sync_run (tenant_id, started_at, status, started_by) values (${ctx.tenantId}, ${a.startedAt}, 'completed', ${by(ctx)}) returning id`);
  const runId = run.id as string;
  const counts = await applyOutcome(tx, ctx, runId, a as Outcome, by(ctx));
  const status: RunStatus = counts.errors ? "completed-with-errors" : "completed";
  await tx.execute(sql`update keyflow.sync_run set status = ${status}, finished_at = now(), people_out = ${counts.peopleOut}, teams_out = ${counts.teamsOut},
    goals_in = ${counts.goalsIn}, reviews_in = ${counts.reviewsIn}, recognition_in = ${counts.recognitionIn}, errors = ${counts.errors} where id = ${runId}`);
  await tx.execute(sql`update keyflow.connection set change_cursor = coalesce(${a.changes.cursor}, change_cursor)`);
  return { runId, status, ...counts };
}

export const recordSync = defineService({
  name: "keyflow.sync.record", action: "keyflow:sync", resource: "keyflow.sync_run", input: recordInput,
  async run(tx, a, ctx) {
    const payload = await writeRun(tx, ctx, a);
    const { runId, ...after } = payload;
    return { result: payload, resourceId: runId, after, events: [{ name: EVENTS.completed, payload }] };
  },
});

export const failSync = defineService({
  name: "keyflow.sync.fail", action: "keyflow:sync", resource: "keyflow.sync_run",
  input: z.object({ startedAt: started, failure: z.string().min(1).max(500) }),
  async run(tx, a, ctx) {
    const [run] = await tx.execute(sql`insert into keyflow.sync_run (tenant_id, started_at, status, failure, started_by) values (${ctx.tenantId}, ${a.startedAt}, 'failed', ${a.failure}, ${by(ctx)}) returning id`);
    const payload: SyncFailed = { runId: run.id as string, failure: a.failure };
    return { result: payload, resourceId: payload.runId, after: { status: "failed", failure: a.failure }, events: [{ name: EVENTS.failed, payload }] };
  },
});
