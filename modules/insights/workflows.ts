import { cron, defineWorkflow, step } from "@amax/workflows";
import { JOBS } from "./contracts";
import { writeBriefing } from "./server/agents";
import { matchSkills } from "./server/match";
import { scanRisks } from "./server/risk";

// 026 T3: each agent is a 029 workflow on a schedule, switchable like any other (Settings, Workflows,
// and Insights' "Recurring agent work"). Each run's output is a plain summary for the jobs table.
export const briefingWorkflow = defineWorkflow({
  name: JOBS.briefing, title: "Weekly strategy briefing",
  run: async (ctx) => step("write", (s) => writeBriefing(ctx.tenantId, s), { timeout: "5m", retry: { maxAttempts: 2 } }),
});
export const riskWorkflow = defineWorkflow({ name: JOBS.riskScan, title: "Project risk scan", run: async (ctx) => step("scan", () => scanRisks(ctx.tenantId), { timeout: "5m" }) });
export const matchWorkflow = defineWorkflow({ name: JOBS.skillsMatch, title: "Skills-to-opportunity match", run: async (ctx) => step("match", () => matchSkills(ctx.tenantId), { timeout: "5m" }) });

export const schedules = [
  cron({ name: JOBS.briefing, title: "Weekly strategy briefing", workflow: JOBS.briefing, cron: "0 7 * * 1", description: "This week's briefing from the current insights, each point with its sources" }),
  cron({ name: JOBS.riskScan, title: "Project risk scan", workflow: JOBS.riskScan, cron: "0 6 * * *", description: "Allocations, approved leave and logged hours on each project" }),
  cron({ name: JOBS.skillsMatch, title: "Skills-to-opportunity match", workflow: JOBS.skillsMatch, cron: "0 6 * * 1", description: "Who rolls off, what they're certified in, and the open pipeline" }),
];
export const workflows = [briefingWorkflow, riskWorkflow, matchWorkflow];
