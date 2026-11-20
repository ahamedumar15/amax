import { sql } from "drizzle-orm";
import type { Tx } from "@amax/db";
import { withdrawnIn } from "./readiness";
import { LATEST_DEPLOYMENTS, nextReleaseOf } from "./in-prod";

export const STALE_DAYS = 14;

export type PortfolioFacts = {
  open: number; tasksDone: number; tasksTotal: number; failed: string | null; stale: string | null; verified: number;
  release: string | null; stage: string | null;
};

export type Computed = {
  sprint: string; sprintDone: number; sprintTotal: number; health: "on-track" | "at-risk" | "off-track";
  healthReason: string | null; nextRelease: string | null; nextReleaseNote: string | null; openProposals: number;
};

export function computePortfolio(f: PortfolioFacts): Computed {
  const health = f.failed ? "off-track" : f.stale ? "at-risk" : "on-track";
  const healthReason = f.failed ? `${f.failed} failed verify` : f.stale ? `${f.stale} unchanged for ${STALE_DAYS}+ days` : null;
  const nextRelease = f.release ?? (f.verified ? `${f.verified} verified` : null);
  const nextReleaseNote = f.release ? (f.stage ? `in ${f.stage}` : "not deployed") : f.verified ? "not released" : null;
  return { sprint: "Continuous", sprintDone: f.tasksDone, sprintTotal: f.tasksTotal, health, healthReason, nextRelease, nextReleaseNote, openProposals: f.open };
}

export const marginLabel = (billing: string, marginPct: number | null) =>
  billing === "internal" ? "Internal" : marginPct === null ? "–" : `${marginPct.toFixed(1)}%`;

const OPEN = sql`p.phase <> 'released' and not ${withdrawnIn("p")}`;
const phaseAt = (k: "proposal" | "tasks") => { const e = sql.raw(`p.meta->'repoPhases'->'${k}'`);
  return sql`case jsonb_typeof(${e}) when 'string' then (${e}#>>'{}')::timestamptz when 'object' then (${e}->>'at')::timestamptz end`; };
const LAST_PROGRESS = sql`coalesce(greatest((select max(t.done_at) from delivery.task t where t.proposal_id = p.id),
  (select max(l.day)::timestamptz from delivery.commit_ledger l where l.proposal_id = p.id), ${phaseAt("proposal")}, ${phaseAt("tasks")}, p.created_at), p.updated_at)`;

export async function portfolioFacts(tx: Tx, projectIds: string[], now: Date): Promise<Map<string, PortfolioFacts>> {
  if (!projectIds.length) return new Map();
  const staleBefore = new Date(now.getTime() - STALE_DAYS * 86_400_000).toISOString();
  const ids = sql.join(projectIds.map((id) => sql`${id}::uuid`), sql`, `);
  const rows = await tx.execute(sql`
    select pr.id,
      (select count(*)::int from delivery.proposal p where p.project_id = pr.id and ${OPEN}) as open,
      (select coalesce(sum(p.tasks_done), 0)::int from delivery.proposal p where p.project_id = pr.id and ${OPEN}) as tasks_done,
      (select coalesce(sum(p.tasks_total), 0)::int from delivery.proposal p where p.project_id = pr.id and ${OPEN}) as tasks_total,
      (select min(p.key) from delivery.proposal p where p.project_id = pr.id and ${OPEN} and upper(p.meta->>'verdict') = 'FAIL') as failed,
      (select min(p.key) from delivery.proposal p where p.project_id = pr.id and ${OPEN} and p.phase = 'building' and ${LAST_PROGRESS} <= ${staleBefore}::timestamptz) as stale,
      (select count(*)::int from delivery.proposal p where p.project_id = pr.id and ${OPEN} and p.phase = 'verified') as verified,
      nr.version as release,
      (select e.name from (${LATEST_DEPLOYMENTS}) d join delivery.environment e on e.id = d.environment_id
        where d.release_id = nr.id and d.status <> 'rolled-back' order by e.position desc limit 1) as stage
    from delivery.project pr
    left join lateral (${nextReleaseOf(sql`pr.id`)}) nr on true
    where pr.id in (${ids})`);
  return new Map(rows.map((r) => [r.id as string, {
    open: Number(r.open), tasksDone: Number(r.tasks_done), tasksTotal: Number(r.tasks_total), failed: (r.failed as string | null) ?? null,
    stale: (r.stale as string | null) ?? null, verified: Number(r.verified), release: (r.release as string | null) ?? null, stage: (r.stage as string | null) ?? null,
  }]));
}
