import { sql } from "drizzle-orm";
import type { JobDef, RetentionEntry } from "@amax/core";

const RUN: RetentionEntry = { table: "workflows.run", label: "Agent run logs", subject: ["acts_for"], entity: "legal_entity_id", fields: ["input", "output", "error", "acts_for"], class: "personal", period: "P180D", start: { at: ["finished_at"], idle: "P2Y" }, action: "delete" };
const STEP: RetentionEntry = { table: "workflows.step", label: "Agent run steps", fields: ["result", "error", "tool_calls"], class: "personal", period: "P180D", start: { at: ["run_finished_at"] }, action: "delete" };
const SIGNAL: RetentionEntry = { table: "workflows.signal", label: "Workflow signals", fields: ["payload"], class: "personal", period: "P30D", start: { at: ["created_at"] }, action: "delete" };

/** 032 AC-1 entries for run records: agent run logs are kept 180 days (the 032 AC-2 tenant default). Steps are kept until their run has finished (run_finished_at),
 * so a run waiting for a long time never loses its checkpoints; runs that never finish age out
 * after two idle years. */
export const workflowsRetention: RetentionEntry[] = [RUN, STEP, SIGNAL];

// Past an entry's period from its own start column, or (for start.idle) since the row last changed.
const expired = (e: RetentionEntry) => sql`${sql.identifier(e.start.at[0])} < now() - ${e.period}::interval`;
const idle = (e: RetentionEntry) => (e.start.idle ? sql`updated_at < now() - ${e.start.idle}::interval` : sql`false`);
const prune = (e: RetentionEntry) => sql`delete from ${sql.identifier(e.table.split(".")[0])}.${sql.identifier(e.table.split(".")[1])} where ${expired(e)} or ${idle(e)}`;

/** Applies the entries above without legal holds; the app runs 032's privacy purge instead (deleting a run deletes its steps). */
export const pruneRunsJob: JobDef = {
  name: "workflows.prune",
  cron: "17 3 * * *",
  async run({ tx }) {
    for (const e of workflowsRetention) await tx.execute(prune(e));
  },
};
