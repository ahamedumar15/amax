import { sql } from "drizzle-orm";
import type { Tx } from "@amax/db";
import { withdrawnIn } from "./readiness";
import { liveProdDeployments } from "./in-prod";

export const STALE_DAYS = 14;

export type PortfolioFacts = {
  open: number; tasksDone: number; tasksTotal: number; failed: string | null; stale: string | null; verified: number;
  release: string | null; stage: string | null;
};

export type Computed = {
  sprint: string; sprintDone: number; sprintTotal: number; health: "on-track" | "at-risk" | "off-track";
  healthReason: string | null; nextRelease: string | null; openProposals: number;
};

export function computePortfolio(f: PortfolioFacts): Computed {
  const health = f.failed ? "off-track" : f.stale ? "at-risk" : "on-track";
  const healthReason = f.failed ? `${f.failed} failed verify` : f.stale ? `${f.stale} unchanged for ${STALE_DAYS}+ days` : null;
  const nextRelease = f.release ? `${f.release}, ${f.stage ? `in ${f.stage}` : "not deployed"}` : f.verified ? `${f.verified} verified, not released` : null;
  return { sprint: `Continuous · ${f.open} open`, sprintDone: f.tasksDone, sprintTotal: f.tasksTotal, health, healthReason, nextRelease, openProposals: f.open };
}

export const marginLabel = (billing: string, marginPct: number | null) =>
  billing === "internal" ? "Internal" : marginPct === null ? "–" : `${marginPct.toFixed(1)}%`;

const OPEN = sql`p.phase <> 'released' and not ${withdrawnIn("p")}`;

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
      (select min(p.key) from delivery.proposal p where p.project_id = pr.id and ${OPEN} and p.phase = 'building' and p.updated_at <= ${staleBefore}::timestamptz) as stale,
      (select count(*)::int from delivery.proposal p where p.project_id = pr.id and ${OPEN} and p.phase = 'verified') as verified,
      nr.version as release,
      (select e.name from delivery.deployment d join delivery.environment e on e.id = d.environment_id
        where d.release_id = nr.id and d.voided_at is null order by e.position desc, d.at desc limit 1) as stage
    from delivery.project pr
    left join lateral (select r.id, r.version from delivery.release r where r.project_id = pr.id
      and not exists (${liveProdDeployments(sql`r.id`)}) order by r.created_at desc limit 1) nr on true
    where pr.id in (${ids})`);
  return new Map(rows.map((r) => [r.id as string, {
    open: Number(r.open), tasksDone: Number(r.tasks_done), tasksTotal: Number(r.tasks_total), failed: (r.failed as string | null) ?? null,
    stale: (r.stale as string | null) ?? null, verified: Number(r.verified), release: (r.release as string | null) ?? null, stage: (r.stage as string | null) ?? null,
  }]));
}
