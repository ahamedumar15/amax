import { sql } from "drizzle-orm";
import { withTenant, type Tx } from "@amax/db";
import { can, type Viewer } from "@amax/auth";
import { ForbiddenError, getRuntime } from "@amax/core/server";
import type { Phase } from "../contracts";

const read = async <T>(viewer: Viewer, fn: (tx: Tx) => Promise<T>) => {
  if (!can(viewer, "delivery:read")) throw new ForbiddenError("delivery:read", "delivery");
  return withTenant(getRuntime().db, viewer.tenantId, fn);
};
const isoDate = (v: unknown) => (v instanceof Date ? v.toISOString().slice(0, 10) : v ? String(v).slice(0, 10) : null);
const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));

export type ProjectRow = {
  id: string; key: string; name: string; client: string; billing: string; managerName: string | null; color: string;
  sprint: string | null; sprintDone: number; sprintTotal: number; health: string; riskPct: number | null;
  marginPct: number | null; contractValue: number | null; invoiced: number | null; nextRelease: string | null;
  sprintStart: string | null; sprintEnd: string | null;
};

const project = (r: Record<string, unknown>): ProjectRow => ({
  id: r.id as string, key: r.key as string, name: r.name as string, client: r.client as string, billing: r.billing as string,
  managerName: (r.manager_name as string | null) ?? null, color: r.color as string, sprint: (r.sprint as string | null) ?? null,
  sprintDone: Number(r.sprint_done), sprintTotal: Number(r.sprint_total), health: r.health as string, riskPct: num(r.risk_pct),
  marginPct: num(r.margin_pct), contractValue: num(r.contract_value), invoiced: num(r.invoiced), nextRelease: (r.next_release as string | null) ?? null,
  sprintStart: isoDate(r.sprint_start), sprintEnd: isoDate(r.sprint_end),
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
  release: (r.version as string | null) ?? ((r.meta as { releaseLabel?: string } | null)?.releaseLabel ?? null), shippedTo: (r.shipped_to as string | null) ?? null, shippedStatus: (r.shipped_status as string | null) ?? null,
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
    const proposals = (await tx.execute(sql`${PROPOSALS} where pr.key = ${key} and ${ACTIVE} order by p.updated_at desc, p.key desc`)).map(proposal);
    return { project: project(r), proposals };
  });

// "Today" for date windows. AMAX_TODAY pins it for the demo tenant and visual tests (fixtures.md's
// Fri Oct 16, 2026), so the screens match the mock.
export const today = () => (process.env.AMAX_TODAY ? new Date(`${process.env.AMAX_TODAY}T15:00:00Z`) : new Date());

const isoWeek = (d: Date) => {
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  t.setUTCDate(t.getUTCDate() + 4 - (t.getUTCDay() || 7));
  return Math.ceil(((t.getTime() - Date.UTC(t.getUTCFullYear(), 0, 1)) / 86_400_000 + 1) / 7);
};
const monday = (d: Date) => { const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())); t.setUTCDate(t.getUTCDate() - ((t.getUTCDay() + 6) % 7)); return t; };

/** Last 8 ISO weeks ending this week: labels W35…W42 and their Mondays. */
export function lastWeeks(now = today(), n = 8) {
  const m = monday(now);
  return Array.from({ length: n }, (_, i) => { const d = new Date(m.getTime() - (n - 1 - i) * 7 * 86_400_000); return { label: `W${isoWeek(d)}`, monday: d.toISOString().slice(0, 10) }; });
}

export const weeklyThroughput = (v: Viewer, now = today()) =>
  read(v, async (tx) => {
    const weeks = lastWeeks(now);
    const rows = await tx.execute(sql`select week::text as week, sum(planned)::int as planned, sum(done)::int as done from delivery.weekly_stat where week >= ${weeks[0].monday} group by week`);
    const at = (w: string) => rows.find((r) => r.week === w);
    return { labels: weeks.map((w) => w.label), planned: weeks.map((w) => Number(at(w.monday)?.planned ?? 0)), done: weeks.map((w) => Number(at(w.monday)?.done ?? 0)) };
  });

/** Proposals that reached Prod per ISO week (from released_at). */
export const shippedPerWeek = (v: Viewer, now = today()) =>
  read(v, async (tx) => {
    const weeks = lastWeeks(now);
    const rows = await tx.execute(sql`select date_trunc('week', released_at)::date::text as week, count(*)::int as n from delivery.proposal where released_at >= ${weeks[0].monday} group by 1`);
    return { labels: weeks.map((w) => w.label), values: weeks.map((w) => Number(rows.find((r) => r.week === w.monday)?.n ?? 0)) };
  });

// In flight = not released; released this month = reached Prod since the 1st (UTC).
export const phaseCounts = (v: Viewer, now = today()) =>
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

/**
 * Columns for every release view: the union of the projects' environment names, in an order that
 * agrees with every project's own stage order (a topological merge; ties by position, then name).
 * Only when projects contradict each other (A before B in one, B before A in another) does the
 * rest fall back to position order (review round 2).
 */
export function stageColumns(releases: ReleaseRow[]): string[] {
  const after = new Map<string, Set<string>>();
  const minPos = new Map<string, number>();
  const seen = new Set<string>();
  for (const r of releases) {
    const own = [...r.stages].sort((a, b) => a.position - b.position);
    own.forEach((s, i) => {
      minPos.set(s.environment, Math.min(minPos.get(s.environment) ?? Infinity, s.position));
      if (!after.has(s.environment)) after.set(s.environment, new Set());
      if (i > 0 && !seen.has(`${own[i - 1].environment}>${s.environment}`)) { seen.add(`${own[i - 1].environment}>${s.environment}`); after.get(own[i - 1].environment)!.add(s.environment); }
    });
  }
  const incoming = new Map([...after.keys()].map((e) => [e, 0]));
  for (const next of after.values()) for (const e of next) incoming.set(e, incoming.get(e)! + 1);
  const byPos = (a: string, b: string) => minPos.get(a)! - minPos.get(b)! || a.localeCompare(b);
  const out: string[] = [];
  const left = new Set(after.keys());
  while (left.size) {
    const ready = [...left].filter((e) => incoming.get(e) === 0).sort(byPos);
    const e = ready[0] ?? [...left].sort(byPos)[0];
    left.delete(e);
    out.push(e);
    for (const n of after.get(e)!) incoming.set(n, incoming.get(n)! - 1);
  }
  return out;
}

export type EnvironmentRow = { name: string; position: number; isProd: boolean; deployments: number };

export const listEnvironments = (v: Viewer, projectKey: string) =>
  read(v, async (tx) => (await tx.execute(sql`select e.name, e.position, e.is_prod, (select count(*)::int from delivery.deployment d where d.environment_id = e.id) as deployments
    from delivery.environment e join delivery.project p on p.id = e.project_id where p.key = ${projectKey} order by e.position`))
    .map((e): EnvironmentRow => ({ name: e.name as string, position: Number(e.position), isProd: Boolean(e.is_prod), deployments: Number(e.deployments) })));

export type DeploymentRow = { id: string; environment: string; status: string; at: string; note: string | null; run: string | null; recordedBy: string; voidedAt: string | null; voidReason: string | null };

/** One release with its proposals and full deployment history, voided ones included. */
export const getRelease = (v: Viewer, projectKey: string, version: string) =>
  read(v, async (tx) => {
    const [r] = await tx.execute(sql`select r.*, p.name as project_name, p.id as pid from delivery.release r join delivery.project p on p.id = r.project_id where p.key = ${projectKey} and r.version = ${version}`);
    if (!r) return null;
    const history = (await tx.execute(sql`select d.*, e.name as env from delivery.deployment d join delivery.environment e on e.id = d.environment_id where d.release_id = ${r.id} order by d.at desc`))
      .map((d): DeploymentRow => ({ id: d.id as string, environment: d.env as string, status: d.status as string, at: new Date(d.at as string).toISOString(), note: (d.note as string | null) ?? null, run: (d.pipeline_run as string | null) ?? null,
        recordedBy: d.recorded_by as string, voidedAt: d.voided_at ? new Date(d.voided_at as string).toISOString() : null, voidReason: (d.void_reason as string | null) ?? null }));
    const proposals = (await tx.execute(sql`select key, title, phase, release_id = ${r.id} as included from delivery.proposal where project_id = ${r.pid} order by key`))
      .map((p) => ({ key: p.key as string, title: p.title as string, phase: p.phase as Phase, included: Boolean(p.included) }));
    return { id: r.id as string, version: r.version as string, projectKey, projectName: r.project_name as string, history, proposals };
  });
