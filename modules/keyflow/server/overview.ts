import { sql } from "drizzle-orm";
import type { Viewer } from "@amax/auth";
import { nextFire } from "@amax/workflows/define";
import { SYNC_CRON } from "../workflows";
import { iso } from "./rows";
import { openErrors, read, runsOf, toError, toRun, totals, type ErrorRow, type RunRow } from "./views";

export type Overview = Awaited<ReturnType<typeof syncOverview>>;
export const RECENT_RUNS = 10;

/** The Keyflow sync at a glance: where it points, the open errors first, what went out and came in, and the latest runs. */
export async function syncOverview(viewer: Viewer) {
  return read(viewer, "keyflow:read", async (tx) => {
    const [c] = await tx.execute(sql`select endpoint, sandbox, set_by, set_at from keyflow.connection`);
    const runs = await runsOf(tx, RECENT_RUNS);
    const errors = await openErrors(tx);
    return {
      connection: c ? { endpoint: (c.endpoint as string | null) ?? null, sandbox: Boolean(c.sandbox), setBy: c.set_by as string, setAt: iso(c.set_at)! } : null,
      lastRun: runs[0] ?? null, nextRunAt: c ? nextFire(SYNC_CRON, "UTC").toISOString() : null, every: "Every 15 minutes",
      ...(await totals(tx)), errors, byKind: { refused: errors.filter((e) => e.kind === "refused").length, unmatched: errors.filter((e) => e.kind === "unmatched").length, invalid: errors.filter((e) => e.kind === "invalid").length },
      runs,
    };
  });
}

export const getSyncRun = (viewer: Viewer, runId: string): Promise<(RunRow & { errorsSeen: ErrorRow[] }) | null> => read(viewer, "keyflow:read", async (tx) => {
  const [r] = await tx.execute(sql`select * from keyflow.sync_run where id = ${runId}`);
  if (!r) return null;
  return { ...toRun(r), errorsSeen: (await tx.execute(sql`select * from keyflow.sync_error where last_run_id = ${runId} order by first_seen_at`)).map(toError) };
});

export const getSyncError = (viewer: Viewer, errorId: string): Promise<ErrorRow | null> => read(viewer, "keyflow:read", async (tx) => {
  const [r] = await tx.execute(sql`select * from keyflow.sync_error where id = ${errorId}`);
  return r ? toError(r) : null;
});
