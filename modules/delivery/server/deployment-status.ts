import { sql } from "drizzle-orm";

export const DEPLOYMENT_STATUSES = ["deployed", "testing", "rolled-back", "failed"] as const;
export type DeploymentStatus = (typeof DEPLOYMENT_STATUSES)[number];

export const unsuccessful = (status: string | null | undefined) => status === "rolled-back" || status === "failed";
export const unsuccessfulSql = sql.raw(`('rolled-back', 'failed')`);

const WORD: Record<string, string> = { deployed: "deployed", testing: "testing", "rolled-back": "rolled back", failed: "failed" };
export const stageWord = (status: string) => WORD[status] ?? status;
export const StageWord = (status: string) => stageWord(status).replace(/^./, (c) => c.toUpperCase());
