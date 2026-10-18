import { cron, defineWorkflow, NonRetryableError, step } from "@amax/workflows";
import { runSync } from "./server/sync";

// The two-way sync as a 029 workflow: one checkpointed step, never a request handler that waits. A
// failure talking to Keyflow is recorded as a failed sync run (the screen shows it) and fails the
// workflow run without retrying; the next slot tries again.
export const syncWorkflow = defineWorkflow({
  name: "keyflow.sync",
  title: "Keyflow sync",
  async run(ctx) {
    const out = await step("sync", () => runSync(ctx.tenantId), { timeout: "10m", retry: { maxAttempts: 2 } });
    if (!out.ok) throw new NonRetryableError(out.summary);
    return out;
  },
});

export const SYNC_CRON = "*/15 * * * *";
export const syncSchedule = cron({
  name: "keyflow.sync", title: "Keyflow sync", workflow: "keyflow.sync", cron: SYNC_CRON,
  description: "Sends people and teams to Keyflow and brings back goals, review scores and recognition",
});
