import { runDueJobs } from "@amax/core/server";
import { getDb, jobRegistry } from "../../../../lib/server";
import { handleTick } from "../../../../lib/tick";

export const dynamic = "force-dynamic";

function tick(req: Request) {
  const db = getDb();
  return handleTick(req, { secret: process.env.CRON_SECRET, run: db ? () => runDueJobs(db, jobRegistry()) : null });
}

export const GET = tick;
export const POST = tick;
