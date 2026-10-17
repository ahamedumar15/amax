import type { JobDef } from "@amax/core";
import { snapshotPipeline } from "./server/stats";

// Month-end totals for the Pipeline value chart: on the 1st, record the pipeline as last month's close.
export const jobs: JobDef[] = [
  { name: "presales.pipeline-snapshot", cron: "5 0 1 * *", run: ({ tx, tenantId }) => snapshotPipeline(tx, tenantId, new Date().toISOString().slice(0, 10)) },
];
