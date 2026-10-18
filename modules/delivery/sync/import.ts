import { sql } from "drizzle-orm";
import { withTenant, type Db } from "@amax/db";
import { canonical, type ServiceContext } from "@amax/core/server";
import { KeyTakenError, syncProposal } from "../server/services";
import type { SpecRecord } from "./specclaw";

export type SyncResult = { created: number; updated: number; unchanged: number; withdrawn: number; skipped: string[] };

const desired = (projectKey: string, r: SpecRecord, sha: string) => ({
  key: `${projectKey}-${r.number}`,
  title: r.title,
  phase: r.phase,
  tasksDone: r.tasksDone,
  tasksTotal: r.tasksTotal,
  releasedAt: r.releasedAt,
  meta: { lane: r.lane, module: r.module, status: r.status, waiting: r.waiting, claim: r.claim, hard: r.hard, optional: r.optional, acs: r.acs, pr: r.pr, verdict: r.verdict, sha, source: r.source },
});

// The meta fields that matter for "changed?". The commit sha alone doesn't count as a change, neither
// as `sha` nor inside `source` ("main@<sha>"): only the ref name is compared (review round 2).
const refOf = (s: unknown) => (typeof s === "string" ? s.replace(/@[0-9a-f]{7,40}$/i, "") : s);
const fingerprint = (d: { title: string; phase: string; tasksDone: number; tasksTotal: number; meta: Record<string, unknown> }) =>
  canonical([d.title, d.phase, d.tasksDone, d.tasksTotal, { ...d.meta, sha: null, source: refOf(d.meta.source) }]);

/**
 * One-way import of a repo's specclaw changes into a delivery project. Writes go through
 * syncProposal (audited as `ctx`, the sync's service principal) and only for changed rows.
 */
export async function syncSpecclaw(db: Db, ctx: ServiceContext, opts: { projectKey: string; projectName: string; client: string; records: SpecRecord[]; sha: string }): Promise<SyncResult> {
  const existing = await withTenant(db, ctx.tenantId, (tx) =>
    tx.execute(sql`select p.key, p.title, p.phase, p.tasks_done, p.tasks_total, p.meta, p.source_ref from delivery.proposal p join delivery.project pr on pr.id = p.project_id
                   where pr.key = ${opts.projectKey} and p.source = 'specclaw'`));
  const byKey = new Map(existing.map((e) => [e.key as string, e]));
  const result: SyncResult = { created: 0, updated: 0, unchanged: 0, withdrawn: 0, skipped: [] };
  const project = { name: opts.projectName, client: opts.client };

  for (const r of opts.records) {
    const d = desired(opts.projectKey, r, opts.sha);
    const cur = byKey.get(d.key);
    byKey.delete(d.key);
    if (r.unreadable) { result.skipped.push(`${d.key}: state.json unreadable at ${r.source}`); continue; }
    // A Released proposal stays Released whatever the repo says (044 AC-2), so that isn't a change.
    if (cur && fingerprint({ title: cur.title as string, phase: cur.phase === "released" ? d.phase : (cur.phase as string), tasksDone: Number(cur.tasks_done), tasksTotal: Number(cur.tasks_total), meta: cur.meta as Record<string, unknown> }) === fingerprint(d)) {
      result.unchanged++;
      continue;
    }
    try {
      await syncProposal(ctx, { projectKey: opts.projectKey, project, source: "specclaw", sourceRef: r.dir, ...d });
    } catch (e) {
      // A released hand-made proposal or another source holds the key: left alone and reported.
      if (!(e instanceof KeyTakenError)) throw e;
      result.skipped.push(`${d.key}: ${e.message}`);
      continue;
    }
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
