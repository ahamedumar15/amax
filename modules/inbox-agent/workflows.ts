import { cron, defineWorkflow, NonRetryableError, step } from "@amax/workflows";
import { SCAN_CRON, SCAN_JOB } from "./contracts";
import { readInboxes } from "./server/scan";
import { triage } from "./server/triage";

// 025 AC-3: the hourly scan is a 029 workflow, never a request handler that waits. The read is one
// checkpointed step; each new message is triaged in its own step, so a retry never reads or suggests
// twice. The run's input and steps carry ids and counts only: the excerpt stays in inbox_agent.find.
export const scanWorkflow = defineWorkflow({
  name: SCAN_JOB,
  title: "Teams and email scan",
  async run(ctx) {
    const read = await step("read", () => readInboxes(ctx.tenantId), { timeout: "5m", retry: { maxAttempts: 2 } });
    if (!read.ok) throw new NonRetryableError(read.summary);
    let suggested = 0;
    for (const id of read.findIds) suggested += await step(`triage-${id}`, (s) => triage(ctx.tenantId, id, s), { timeout: "2m", retry: { maxAttempts: 2 } });
    return { summary: read.findIds.length ? `${read.summary}; ${suggested} suggested` : read.summary };
  },
});

/** Switchable like any 029 schedule (Settings, Workflows; the Suggestions screen lists it as this kind's job). */
export const scanSchedule = cron({
  name: SCAN_JOB, title: "Teams and email scan", workflow: SCAN_JOB, cron: SCAN_CRON,
  description: "Sales channels and account mailboxes on the inbox agent's allow-list",
});
