import { sql } from "drizzle-orm";
import type { JobDef, RetentionEntry } from "@amax/core";

/** 032 AC-1 entries for run records: inputs, outputs, step results and tool calls can hold personal data. */
export const workflowsRetention: RetentionEntry[] = [
  { table: "workflows.run", fields: ["input", "output", "error", "acts_for"], class: "personal", period: "P1Y", start: { at: ["finished_at"] }, action: "delete" },
  { table: "workflows.step", fields: ["result", "error", "tool_calls"], class: "personal", period: "P1Y", start: { at: ["finished_at"] }, action: "delete" },
  { table: "workflows.signal", fields: ["payload"], class: "personal", period: "P30D", start: { at: ["created_at"] }, action: "delete" },
];

/** Applies the entries above daily until 032's enforcer takes them over. */
export const pruneRunsJob: JobDef = {
  name: "workflows.prune",
  cron: "17 3 * * *",
  async run({ tx }) {
    await tx.execute(sql`delete from workflows.run where finished_at < now() - interval '1 year'`);
    await tx.execute(sql`delete from workflows.signal where created_at < now() - interval '30 days'`);
  },
};
