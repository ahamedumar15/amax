import { sql } from "drizzle-orm";
import type { JobDef, RetentionEntry } from "@amax/core";

const RUN: RetentionEntry = { table: "workflows.run", fields: ["input", "output", "error", "acts_for"], class: "personal", period: "P1Y", start: { at: ["finished_at"], idle: "P2Y" }, action: "delete" };
const STEP: RetentionEntry = { table: "workflows.step", fields: ["result", "error", "tool_calls"], class: "personal", period: "P1Y", start: { at: ["run_finished_at"] }, action: "delete" };
const SIGNAL: RetentionEntry = { table: "workflows.signal", fields: ["payload"], class: "personal", period: "P30D", start: { at: ["created_at"] }, action: "delete" };

/** 032 AC-1 entries for run records. Steps are kept until their run has finished (run_finished_at),
 * so a run waiting for a long time never loses its checkpoints; runs that never finish age out
 * after two idle years. */
export const workflowsRetention: RetentionEntry[] = [RUN, STEP, SIGNAL];

const due = (e: RetentionEntry, column: string, period: string) => sql`${sql.raw(column)} < now() - ${period}::interval`;

/** Applies the entries above daily until 032's enforcer takes them over (deleting a run deletes its steps). */
export const pruneRunsJob: JobDef = {
  name: "workflows.prune",
  cron: "17 3 * * *",
  async run({ tx }) {
    await tx.execute(sql`delete from workflows.run where ${due(RUN, "finished_at", RUN.period)} or ${due(RUN, "updated_at", RUN.start.idle!)}`);
    await tx.execute(sql`delete from workflows.step where ${due(STEP, "run_finished_at", STEP.period)}`);
    await tx.execute(sql`delete from workflows.signal where ${due(SIGNAL, "created_at", SIGNAL.period)}`);
  },
};
