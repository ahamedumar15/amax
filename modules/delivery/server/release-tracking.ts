import { sql, type SQL } from "drizzle-orm";
import type { Tx } from "@amax/db";
import { entityZone } from "@amax/workflows";
import { clockOf } from "./queries";
import { invalid } from "./refusal";
import { categoryLabel, completionOf, releaseDay, releaseStatus, type Category, type ReleaseStatus } from "./release-status";

type Row = Record<string, unknown>;
type Source = "create" | "update" | "deployment" | "void";
export type Dates = { category: Category; startDate: string; targetDate: string };

export const zoneOf = (tx: Tx, project: Row) => entityZone(tx, (project.legal_entity_id as string | null) ?? null);

export async function statusFor(tx: Tx, project: Row, d: Pick<Dates, "startDate" | "targetDate">) {
  const today = releaseDay(await zoneOf(tx, project), await clockOf(tx));
  return releaseStatus({ today, start: d.startDate, target: d.targetDate, completed: false });
}

export const categoryEnv = async (tx: Tx, projectId: unknown, category: Category) =>
  (await tx.execute(category === "prod" ? sql`select * from delivery.environment where project_id = ${projectId} and is_prod`
    : sql`select * from delivery.environment where project_id = ${projectId} and lower(name) = ${category}`))[0];

export const datesProblem = (start: string, target: string) => (target < start ? `The target date (${target}) is before the start date (${start})` : null);
export const categoryProblem = async (tx: Tx, project: Row, category: Category) =>
  ((await categoryEnv(tx, project.id, category)) ? null : `${project.key as string} has no ${categoryLabel(category)} environment; add one, or pick another category`);

export async function checkDates(tx: Tx, project: Row, d: Dates) {
  const problem = datesProblem(d.startDate, d.targetDate) ?? (await categoryProblem(tx, project, d.category));
  if (problem) throw invalid(problem);
}

export async function tracked(tx: Tx, releaseId: unknown) {
  const [r] = await tx.execute(sql`select id, tenant_id, version, name, category, status, completing_deployment_id,
    start_date::text as start_date, target_date::text as target_date from delivery.release where id = ${releaseId}`);
  return r;
}

export function notCompleted(r: Row, projectKey: string) {
  if (r.status === "completed") throw invalid(`${projectKey} ${r.version as string} is completed; it can't change`);
}

export async function writeStatus(tx: Tx, r: Row, to: ReleaseStatus, source: Source, by: string, deploymentId: string | null = null, also: SQL = sql``) {
  await tx.execute(sql`update delivery.release set status = ${to}, updated_at = now() ${also} where id = ${r.id}`);
  if (r.status === to) return;
  await tx.execute(sql`insert into delivery.release_status_history (tenant_id, release_id, from_status, to_status, source, deployment_id, changed_by)
    values (${r.tenant_id}, ${r.id}, ${(r.status as string | null) ?? null}, ${to}, ${source}, ${deploymentId}, ${by})`);
}

async function completeBy(tx: Tx, project: Row, r: Row, d: Row, source: Source, by: string) {
  const completion = completionOf(releaseDay(await zoneOf(tx, project), d.at as string), r.target_date as string);
  await writeStatus(tx, r, "completed", source, by, d.id as string, sql`, completed_at = ${d.at}, completion = ${completion}, completing_deployment_id = ${d.id}`);
}

export async function completeOnDeployment(tx: Tx, project: Row, releaseId: unknown, d: Row, by: string) {
  const r = await tracked(tx, releaseId);
  if (!r.category || r.status === "completed" || d.status !== "deployed") return;
  const env = await categoryEnv(tx, project.id, r.category as Category);
  if (env && env.id === d.environment_id) await completeBy(tx, project, r, d, "deployment", by);
}

export async function reopenOnVoid(tx: Tx, project: Row, releaseId: unknown, voidedId: unknown, by: string) {
  const r = await tracked(tx, releaseId);
  if (r.completing_deployment_id !== voidedId) return;
  const env = await categoryEnv(tx, project.id, r.category as Category);
  const [next] = env ? await tx.execute(sql`select id, at from delivery.deployment where release_id = ${r.id} and environment_id = ${env.id}
    and status = 'deployed' and voided_at is null order by at limit 1`) : [];
  if (next) return completeBy(tx, project, r, next, "void", by);
  const to = await statusFor(tx, project, { startDate: r.start_date as string, targetDate: r.target_date as string });
  await writeStatus(tx, r, to, "void", by, null, sql`, completed_at = null, completion = null, completing_deployment_id = null`);
}
