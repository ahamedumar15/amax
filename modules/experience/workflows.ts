import { cron, defineWorkflow, step } from "@amax/workflows";
import { JOBS } from "./contracts";
import { runCollect } from "./server/collect";
import { runRemediations } from "./server/remediate";

// AC-1: the daily collection as a 029 workflow, one checkpointed step, never a request that waits.
export const collectWorkflow = defineWorkflow({
  name: JOBS.collect,
  title: "Digital experience collection",
  run: (ctx) => step("collect", () => runCollect(ctx.tenantId), { timeout: "10m", retry: { maxAttempts: 2 } }),
});

// AC-5: approved remediations, each recorded once, so a retry never runs one twice.
export const remediateWorkflow = defineWorkflow({
  name: JOBS.remediate,
  title: "Approved Intune remediations",
  run: (ctx) => step("remediate", () => runRemediations(ctx.tenantId), { timeout: "10m", retry: { maxAttempts: 1 } }),
});

export const collectSchedule = cron({
  name: JOBS.collect, title: "Digital experience collection", workflow: JOBS.collect, cron: "0 5 * * *",
  description: "Reads device health, boot time, app crashes and Defender risk from Intune for entities with a staff notice; finds issues for the experience agent",
});
export const remediateSchedule = cron({
  name: JOBS.remediate, title: "Approved Intune remediations", workflow: JOBS.remediate, cron: "*/30 * * * *",
  description: "Runs the remediations IT approved, through the write registration once an Admin switched it on",
});
