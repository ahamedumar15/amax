import { cron, defineWorkflow, step } from "@amax/workflows";
import { applyDue } from "./server/apply";
import { runSync } from "./server/sync";

// AC-1: the read-only sync, as a 029 workflow: one checkpointed step per run, never a request that
// waits. A source without a credential is recorded as skipped; one that fails as failed.
export const syncWorkflow = defineWorkflow({
  name: "it-access.sync",
  title: "Access and licences sync",
  run: (ctx) => step("sync", () => runSync(ctx.tenantId), { timeout: "10m", retry: { maxAttempts: 2 } }),
});

// AC-2: approved changes that are due (a leaver's on their last day) are made, or left to IT by hand
// while the write registration is off. Each change is recorded once, so a retry never repeats one.
export const applyWorkflow = defineWorkflow({
  name: "it-access.apply",
  title: "Approved access changes",
  run: (ctx) => step("apply", () => applyDue(ctx.tenantId), { timeout: "10m", retry: { maxAttempts: 1 } }),
});

export const syncSchedule = cron({
  name: "it-access.sync", title: "Access and licences sync", workflow: "it-access.sync", cron: "0 * * * *",
  description: "Reads licences, sign-ins, admin roles and devices from Microsoft Graph, Azure DevOps and GitHub (read-only)",
});
export const applySchedule = cron({
  name: "it-access.apply", title: "Approved access changes", workflow: "it-access.apply", cron: "*/15 * * * *",
  description: "Makes the access changes IT approved once they are due, through the write registration when it is consented",
});
