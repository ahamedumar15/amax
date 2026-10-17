import { runDueJobs } from "@amax/core/server";
import type { Db } from "@amax/db";
import { getDb, jobRegistry, workflowEngine } from "../../../../lib/server";
import { handleTick } from "../../../../lib/tick";

export const dynamic = "force-dynamic";

// Jobs and outbox first, so events a workflow waits for are signalled before its runs are driven.
async function runAll(db: Db) {
  const jobs = await runDueJobs(db, jobRegistry());
  return { ...jobs, ...(await (await workflowEngine()).tick()) };
}

function tick(req: Request) {
  const db = getDb();
  return handleTick(req, { secret: process.env.CRON_SECRET, run: db ? () => runAll(db) : null });
}

export const GET = tick;
export const POST = tick;
