import { sql } from "drizzle-orm";
import type { FixtureSeed } from "@amax/core";
import type { Tx } from "@amax/db";
import { contextFor, type ServiceContext } from "@amax/core/server";
import { planSync } from "../server/plan";
import { writeRun } from "../server/record";
import { sandboxTransport } from "../server/sandbox";

const MIN = 60_000;

// One sandbox sync, written as if it ran `ago` minutes back: the same plan and record code the job uses.
async function syncAt(tx: Tx, ctx: ServiceContext, ago: number) {
  const plan = await planSync(tx, ctx);
  const keyflow = sandboxTransport(plan.directory);
  const startedAt = new Date(Date.now() - ago * MIN).toISOString();
  const { runId } = await writeRun(tx, ctx, { startedAt, sent: plan.sent, refused: (await keyflow.push(plan.batch)).refused, changes: await keyflow.changes(plan.connection!.cursor) });
  const finished = new Date(Date.parse(startedAt) + 20_000).toISOString();
  await tx.execute(sql`update keyflow.sync_run set finished_at = ${finished} where id = ${runId}`);
  await tx.execute(sql`update keyflow.sync_error set last_seen_at = ${finished}, first_seen_at = case when runs = 1 then ${finished} else first_seen_at end where last_run_id = ${runId}`);
}

// The demo tenant syncs with the sandbox Keyflow (fictional): a full sync 34 minutes ago, a failed
// one 19 minutes ago, and the latest 4 minutes ago, which only re-sent the person Keyflow refused.
export const keyflowFixtures: FixtureSeed = async ({ tx, tenantId }) => {
  const [done] = await tx.execute(sql`select 1 from keyflow.connection`);
  if (done) return;
  await tx.execute(sql`insert into keyflow.connection (tenant_id, sandbox, set_by, set_at) values (${tenantId}, true, 'fixtures', now() - interval '40 minutes')`);
  const ctx = contextFor.job(tenantId, "keyflow.sync");
  await syncAt(tx, ctx, 34);
  await tx.execute(sql`insert into keyflow.sync_run (tenant_id, started_at, finished_at, status, failure, started_by)
    values (${tenantId}, now() - interval '19 minutes', now() - interval '19 minutes' + interval '31 seconds', 'failed', 'Keyflow answered 503', 'job:keyflow.sync')`);
  await syncAt(tx, ctx, 4);
};
