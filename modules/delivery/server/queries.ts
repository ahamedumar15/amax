import { sql } from "drizzle-orm";
import { withTenant, type Tx } from "@amax/db";
import { can, type Viewer } from "@amax/auth";
import { ForbiddenError, getRuntime } from "@amax/core/server";
import type { Phase } from "../contracts";

const read = async <T>(viewer: Viewer, fn: (tx: Tx) => Promise<T>) => {
  if (!can(viewer, "delivery:read")) throw new ForbiddenError("delivery:read", "delivery");
  return withTenant(getRuntime().db, viewer.tenantId, fn);
};
const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));

export type ProjectRow = {
  id: string; key: string; name: string; client: string; billing: string; managerName: string | null; color: string;
  sprint: string | null; sprintDone: number; sprintTotal: number; health: string; riskPct: number | null;
  marginPct: number | null; contractValue: number | null; invoiced: number | null; nextRelease: string | null;
};

const project = (r: Record<string, unknown>): ProjectRow => ({
  id: r.id as string, key: r.key as string, name: r.name as string, client: r.client as string, billing: r.billing as string,
  managerName: (r.manager_name as string | null) ?? null, color: r.color as string, sprint: (r.sprint as string | null) ?? null,
  sprintDone: Number(r.sprint_done), sprintTotal: Number(r.sprint_total), health: r.health as string, riskPct: num(r.risk_pct),
  marginPct: num(r.margin_pct), contractValue: num(r.contract_value), invoiced: num(r.invoiced), nextRelease: (r.next_release as string | null) ?? null,
});

export const listProjects = (v: Viewer, status: "active" | "closed" = "active") =>
  read(v, async (tx) => (await tx.execute(sql`select * from delivery.project where status = ${status} order by created_at, name`)).map(project));

export type ProposalRow = {
  id: string; key: string; title: string; phase: Phase; tasksDone: number; tasksTotal: number; hours: number; estimateHours: number | null;
  ownerName: string | null; agent: string | null; projectKey: string; projectName: string; projectColor: string;
  release: string | null; shippedTo: string | null; shippedStatus: string | null; source: string | null; meta: Record<string, unknown>;
};

const proposal = (r: Record<string, unknown>): ProposalRow => ({
  id: r.id as string, key: r.key as string, title: r.title as string, phase: r.phase as Phase, tasksDone: Number(r.tasks_done), tasksTotal: Number(r.tasks_total),
  hours: Number(r.hours), estimateHours: num(r.estimate_hours), ownerName: (r.owner_name as string | null) ?? null, agent: (r.agent as string | null) ?? null,
  projectKey: r.project_key as string, projectName: r.project_name as string, projectColor: r.project_color as string,
  release: (r.version as string | null) ?? null, shippedTo: (r.shipped_to as string | null) ?? null, shippedStatus: (r.shipped_status as string | null) ?? null,
  source: (r.source as string | null) ?? null, meta: (r.meta as Record<string, unknown>) ?? {},
});

// The furthest environment each release reached, for "Shipped to".
const PROPOSALS = sql`
  select p.*, pr.key as project_key, pr.name as project_name, pr.color as project_color, r.version, last.name as shipped_to, last.status as shipped_status
  from delivery.proposal p
  join delivery.project pr on pr.id = p.project_id
  left join delivery.release r on r.id = p.release_id
  left join lateral (
    select e.name, d.status from delivery.deployment d join delivery.environment e on e.id = d.environment_id
    where d.release_id = p.release_id and d.voided_at is null order by e.position desc, d.at desc limit 1) last on true`;

const ACTIVE = sql`coalesce(p.meta->>'withdrawn', 'false') <> 'true'`;

export const listProposals = (v: Viewer, opts: { phase?: Phase; projectKey?: string } = {}) =>
  read(v, async (tx) => {
    // Withdrawn spec proposals (their folder is gone) are history, not work: never in lists or counts.
    const where = [ACTIVE, opts.phase ? sql`p.phase = ${opts.phase}` : undefined, opts.projectKey ? sql`pr.key = ${opts.projectKey}` : undefined].filter(Boolean);
    const filter = where.length ? sql`where ${sql.join(where as ReturnType<typeof sql>[], sql` and `)}` : sql``;
    return (await tx.execute(sql`${PROPOSALS} ${filter} order by p.updated_at desc, p.key desc`)).map(proposal);
  });

export const getProject = (v: Viewer, key: string) =>
  read(v, async (tx) => {
    const [r] = await tx.execute(sql`select * from delivery.project where key = ${key}`);
    if (!r) return null;
    const proposals = (await tx.execute(sql`${PROPOSALS} where pr.key = ${key} and ${ACTIVE} order by p.key desc`)).map(proposal);
    return { project: project(r), proposals };
  });

// In flight = not released; released this month = reached Prod since the 1st (UTC).
export const phaseCounts = (v: Viewer, now = new Date()) =>
  read(v, async (tx) => {
    const month = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
    const rows = await tx.execute(sql`select phase, count(*)::int as n, count(*) filter (where released_at >= ${month})::int as this_month from delivery.proposal p where ${ACTIVE} group by phase`);
    const get = (p: Phase) => rows.find((r) => r.phase === p);
    const counts = { proposed: Number(get("proposed")?.n ?? 0), planned: Number(get("planned")?.n ?? 0), building: Number(get("building")?.n ?? 0), verified: Number(get("verified")?.n ?? 0) };
    return { ...counts, inFlight: counts.proposed + counts.planned + counts.building + counts.verified, releasedThisMonth: Number(get("released")?.this_month ?? 0) };
  });

export type ReleaseRow = {
  id: string; projectId: string; version: string; projectKey: string; projectName: string; projectColor: string; proposals: number;
  stages: { environment: string; position: number; isProd: boolean; status: string | null; at: string | null; note: string | null; run: string | null }[];
};

export const listReleases = (v: Viewer) =>
  read(v, async (tx) => {
    const envs = await tx.execute(sql`select * from delivery.environment order by project_id, position`);
    const releases = await tx.execute(sql`select r.*, pr.key as project_key, pr.name as project_name, pr.color as project_color,
      (select count(*)::int from delivery.proposal p where p.release_id = r.id) as proposals
      from delivery.release r join delivery.project pr on pr.id = r.project_id order by r.created_at desc`);
    const deps = await tx.execute(sql`select distinct on (release_id, environment_id) * from delivery.deployment where voided_at is null order by release_id, environment_id, at desc`);
    return releases.map((r): ReleaseRow => ({
      id: r.id as string, projectId: r.project_id as string, version: r.version as string, projectKey: r.project_key as string, projectName: r.project_name as string,
      projectColor: r.project_color as string, proposals: Number(r.proposals),
      stages: envs.filter((e) => e.project_id === r.project_id).map((e) => {
        const d = deps.find((x) => x.release_id === r.id && x.environment_id === e.id);
        return { environment: e.name as string, position: Number(e.position), isProd: Boolean(e.is_prod), status: (d?.status as string | null) ?? null,
          at: d ? new Date(d.at as string).toISOString() : null, note: (d?.note as string | null) ?? null, run: (d?.pipeline_run as string | null) ?? null };
      }),
    }));
  });

/** Columns for every release view: the union of the projects' environment names, in stage order. */
export const stageColumns = (releases: ReleaseRow[]) =>
  [...new Map(releases.flatMap((r) => r.stages).sort((a, b) => a.position - b.position).map((s) => [s.environment, s.environment])).keys()];

export type EnvironmentRow = { name: string; position: number; isProd: boolean; deployments: number };

export const listEnvironments = (v: Viewer, projectKey: string) =>
  read(v, async (tx) => (await tx.execute(sql`select e.name, e.position, e.is_prod, (select count(*)::int from delivery.deployment d where d.environment_id = e.id) as deployments
    from delivery.environment e join delivery.project p on p.id = e.project_id where p.key = ${projectKey} order by e.position`))
    .map((e): EnvironmentRow => ({ name: e.name as string, position: Number(e.position), isProd: Boolean(e.is_prod), deployments: Number(e.deployments) })));

export type DeploymentRow = { environment: string; status: string; at: string; note: string | null; run: string | null; recordedBy: string; voidedAt: string | null; voidReason: string | null };

/** One release with its proposals and full deployment history, voided ones included. */
export const getRelease = (v: Viewer, projectKey: string, version: string) =>
  read(v, async (tx) => {
    const [r] = await tx.execute(sql`select r.*, p.name as project_name, p.id as pid from delivery.release r join delivery.project p on p.id = r.project_id where p.key = ${projectKey} and r.version = ${version}`);
    if (!r) return null;
    const history = (await tx.execute(sql`select d.*, e.name as env from delivery.deployment d join delivery.environment e on e.id = d.environment_id where d.release_id = ${r.id} order by d.at desc`))
      .map((d): DeploymentRow => ({ environment: d.env as string, status: d.status as string, at: new Date(d.at as string).toISOString(), note: (d.note as string | null) ?? null, run: (d.pipeline_run as string | null) ?? null,
        recordedBy: d.recorded_by as string, voidedAt: d.voided_at ? new Date(d.voided_at as string).toISOString() : null, voidReason: (d.void_reason as string | null) ?? null }));
    const proposals = (await tx.execute(sql`select key, title, phase, release_id = ${r.id} as included from delivery.proposal where project_id = ${r.pid} order by key`))
      .map((p) => ({ key: p.key as string, title: p.title as string, phase: p.phase as Phase, included: Boolean(p.included) }));
    return { id: r.id as string, version: r.version as string, projectKey, projectName: r.project_name as string, history, proposals };
  });
