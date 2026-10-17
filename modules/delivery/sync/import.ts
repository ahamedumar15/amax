import { sql } from "drizzle-orm";
import { withTenant, type Db } from "@amax/db";
import { canonical, type ServiceContext } from "@amax/core/server";
import { syncProposal } from "../server/services";
import type { SpecRecord } from "./specclaw";

export type SyncResult = { created: number; updated: number; unchanged: number; withdrawn: number };

const desired = (projectKey: string, r: SpecRecord, sha: string) => ({
  key: `${projectKey}-${r.number}`,
  title: r.title,
  phase: r.phase,
  tasksDone: r.tasksDone,
  tasksTotal: r.tasksTotal,
  releasedAt: r.releasedAt,
  meta: { lane: r.lane, module: r.module, status: r.status, waiting: r.waiting, claim: r.claim, hard: r.hard, optional: r.optional, acs: r.acs, pr: r.pr, verdict: r.verdict, sha },
});

// The meta fields that matter for "changed?" (the commit sha alone doesn't count as a change).
const fingerprint = (d: { title: string; phase: string; tasksDone: number; tasksTotal: number; meta: Record<string, unknown> }) =>
  canonical([d.title, d.phase, d.tasksDone, d.tasksTotal, { ...d.meta, sha: null }]);

/**
 * One-way import of a repo's specclaw changes into a delivery project. Writes go through
 * syncProposal (audited as `ctx`, the sync's service principal) and only for changed rows.
 */
export async function syncSpecclaw(db: Db, ctx: ServiceContext, opts: { projectKey: string; projectName: string; client: string; records: SpecRecord[]; sha: string }): Promise<SyncResult> {
  const existing = await withTenant(db, ctx.tenantId, (tx) =>
    tx.execute(sql`select p.key, p.title, p.phase, p.tasks_done, p.tasks_total, p.meta, p.source_ref from delivery.proposal p join delivery.project pr on pr.id = p.project_id
                   where pr.key = ${opts.projectKey} and p.source = 'specclaw'`));
  const byKey = new Map(existing.map((e) => [e.key as string, e]));
  const result: SyncResult = { created: 0, updated: 0, unchanged: 0, withdrawn: 0 };
  const project = { name: opts.projectName, client: opts.client };

  for (const r of opts.records) {
    const d = desired(opts.projectKey, r, opts.sha);
    const cur = byKey.get(d.key);
    byKey.delete(d.key);
    if (cur && fingerprint({ title: cur.title as string, phase: cur.phase as string, tasksDone: Number(cur.tasks_done), tasksTotal: Number(cur.tasks_total), meta: cur.meta as Record<string, unknown> }) === fingerprint(d)) {
      result.unchanged++;
      continue;
    }
    await syncProposal(ctx, { projectKey: opts.projectKey, project, source: "specclaw", sourceRef: r.dir, ...d });
    if (cur) result.updated++;
    else result.created++;
  }
  // Folders that disappeared are marked withdrawn, never deleted.
  for (const [key, cur] of byKey) {
    const meta = cur.meta as Record<string, unknown>;
    if (meta.withdrawn) continue;
    await syncProposal(ctx, {
      projectKey: opts.projectKey, project, key, title: cur.title as string, phase: cur.phase as never, tasksDone: Number(cur.tasks_done), tasksTotal: Number(cur.tasks_total),
      source: "specclaw", sourceRef: String(cur.source_ref ?? key), releasedAt: null, meta: { ...meta, withdrawn: true, sha: opts.sha },
    });
    result.withdrawn++;
  }
  return result;
}
