import { sql } from "drizzle-orm";
import type { JobDef, RetentionEntry } from "@amax/core";

const RUN: RetentionEntry = { table: "workflows.run", fields: ["input", "output", "error", "acts_for"], class: "personal", period: "P1Y", start: { at: ["finished_at"], idle: "P2Y" }, action: "delete" };
const STEP: RetentionEntry = { table: "workflows.step", fields: ["result", "error", "tool_calls"], class: "personal", period: "P1Y", start: { at: ["run_finished_at"] }, action: "delete" };
const SIGNAL: RetentionEntry = { table: "workflows.signal", fields: ["payload"], class: "personal", period: "P30D", start: { at: ["created_at"] }, action: "delete" };

/** 032 AC-1 entries for run records. Steps are kept until their run has finished (run_finished_at),
 * so a run waiting for a long time never loses its checkpoints; runs that never finish age out
 * after two idle years. */
export const workflowsRetention: RetentionEntry[] = [RUN, STEP, SIGNAL];

// Past an entry's period from its own start column, or (for start.idle) since the row last changed.
const expired = (e: RetentionEntry) => sql`${sql.identifier(e.start.at[0])} < now() - ${e.period}::interval`;
const idle = (e: RetentionEntry) => (e.start.idle ? sql`updated_at < now() - ${e.start.idle}::interval` : sql`false`);
const prune = (e: RetentionEntry) => sql`delete from ${sql.identifier(e.table.split(".")[0])}.${sql.identifier(e.table.split(".")[1])} where ${expired(e)} or ${idle(e)}`;

/** Applies the entries above daily until 032's enforcer takes them over (deleting a run deletes its steps). */
export const pruneRunsJob: JobDef = {
  name: "workflows.prune",
  cron: "17 3 * * *",
  async run({ tx }) {
    for (const e of workflowsRetention) await tx.execute(prune(e));
  },
};
