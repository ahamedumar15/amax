import { sql } from "drizzle-orm";
import { z } from "zod";
import { setTenant, type Tx } from "@amax/db";
import { assertCan, can, viewerOf, type Viewer } from "@amax/auth";
import { appendAudit, defineService, ForbiddenError, getRuntime, type Emitted, type ServiceContext, type Source } from "@amax/core/server";
import { PHASES, type Phase } from "../contracts";
import { desired, fingerprint, storedSpecRows, type Task } from "../sync/import";
import { forUserOf } from "./activity";
import { ctxFor } from "./context";
import { normaliseRepo } from "./repo-sync";
import { KeyTakenError, upsertSpecProposal } from "./services";
import { TaskInput } from "./tasks";

// 062: sync_specclaw, a repo's specclaw state pushed from a developer's machine. amax decides what it
// accepts: the project's linked repo only, a person on the project (delivery:proposal:push, not the
// unguarded delivery:proposal:sync), and per proposal nothing Released, no step back a phase and
// nothing older than the commit it was last synced from. One push is one transaction under the
// project's row lock, so concurrent pushes serialise and a failure leaves nothing half applied.

const text = (n: number) => z.string().max(n);
const SpecRecordInput = z.object({
  number: z.string().regex(/^\d{3,6}$/), dir: z.string().regex(/^\d{3,6}-[a-z0-9][a-z0-9-]{0,99}$/), title: text(200).min(1), lane: text(80), module: text(200),
  phase: z.enum(PHASES), approved: z.boolean(), claim: text(80).nullable(), hard: z.array(text(8)).max(50), optional: z.array(text(8)).max(50),
  tasksDone: z.number().int().min(0).max(500), tasksTotal: z.number().int().min(0).max(500), tasks: z.array(TaskInput).max(500), acs: z.number().int().min(0).max(500),
  pr: z.string().url().max(300).nullable(), verdict: text(20).nullable(), done: z.boolean(), status: z.enum(["done", "claimed", "not approved", "blocked", "ready"]),
  waiting: z.array(text(8)).max(50), updatedAt: text(40).nullable(), releasedAt: text(40).nullable(), source: text(300), unreadable: z.boolean(),
});

export const MAX_PUSH = 200;
// A commit time from a skewed clock or a hand-written payload must not make every later push "stale".
const SKEW_MS = 5 * 60_000;
export const PushInput = z.object({
  projectKey: z.string(), repoUrl: z.string().min(3).max(300), ref: z.string().min(1).max(200), sha: z.string().regex(/^[0-9a-f]{7,40}$/i),
  committedAt: z.string().datetime({ offset: true }).refine((t) => Date.parse(t) <= Date.now() + SKEW_MS, "committedAt is in the future"),
  dryRun: z.boolean().default(true), records: z.array(SpecRecordInput).max(MAX_PUSH),
});
export type PushResult = { outcome: "preview" | "applied" | "refused"; projectKey: string; reason: string | null; created: number; updated: number; unchanged: number; skipped: string[] };

const Plan = PushInput.omit({ projectKey: true, dryRun: true }).extend({ projectId: z.string().uuid(), projectKey: z.string() });
type Plan = z.infer<typeof Plan>;
type Counts = { created: number; updated: number; unchanged: number; skipped: string[] };
type Stored = Record<string, unknown>;

/** What a push may not do to one proposal; null when it may go ahead. */
function refusal(d: { phase: Phase }, cur: Stored | undefined, committedAt: string) {
  if (d.phase === "released" && cur?.phase !== "released") return "released comes from Prod deployments";
  if (!cur) return null;
  const at = (cur.meta as Stored | null)?.committedAt;
  if (typeof at === "string" && Date.parse(at) > Date.parse(committedAt)) return `stale: last synced from a newer commit (${at})`;
  if (cur.phase !== "released" && PHASES.indexOf(d.phase) < PHASES.indexOf(cur.phase as Phase)) return `would move back from ${String(cur.phase)} to ${d.phase}`;
  return null;
}

const unchanged = (cur: Stored, d: Parameters<typeof fingerprint>[0] & { phase: Phase }) =>
  fingerprint({ title: cur.title as string, phase: cur.phase === "released" ? d.phase : (cur.phase as string), tasksDone: Number(cur.tasks_done), tasksTotal: Number(cur.tasks_total), tasks: cur.tasks as Task[], meta: cur.meta as Stored }) === fingerprint(d);

/** The push's writes in `tx`; the caller commits them (apply) or rolls them back (preview). */
async function applyPush(tx: Tx, p: Plan, ctx: ServiceContext) {
  const [project] = await tx.execute(sql`select * from delivery.project where id = ${p.projectId} for update`);
  const byKey = new Map((await storedSpecRows(tx, p.projectKey)).map((e) => [e.key as string, e as Stored]));
  const counts: Counts = { created: 0, updated: 0, unchanged: 0, skipped: [] };
  const events: Emitted[] = [];
  for (const r of p.records) {
    const key = `${p.projectKey}-${r.number}`;
    const cur = byKey.get(key);
    const base = desired(p.projectKey, { ...r, source: `${p.ref}@${p.sha}` }, p.sha, (cur?.tasks as Task[] | undefined) ?? []);
    const prior = (cur?.meta ?? {}) as Stored;
    // A branch without main's PR link or verdict doesn't clear them.
    const d = { ...base, meta: { ...base.meta, pr: base.meta.pr ?? prior.pr ?? null, verdict: base.meta.verdict ?? prior.verdict ?? null, committedAt: p.committedAt } };
    const why = r.unreadable ? "state.json unreadable" : refusal(d, cur, p.committedAt);
    if (why) { counts.skipped.push(`${key}: ${why}`); continue; }
    if (cur && unchanged(cur, d)) { counts.unchanged++; continue; }
    try {
      const out = await upsertSpecProposal(tx, { projectKey: p.projectKey, project: { name: project.name as string, client: project.client as string }, source: "specclaw", sourceRef: r.dir, ...d }, ctx, project);
      await appendAudit(tx, ctx, { action: "delivery.proposal.sync", resource: "delivery.proposal", resourceId: out.resourceId, before: out.before, after: out.after });
      events.push(...out.events);
    } catch (e) {
      if (!(e instanceof KeyTakenError)) throw e;
      counts.skipped.push(`${key}: ${e.message}`);
      continue;
    }
    if (cur) counts.updated++;
    else counts.created++;
  }
  return { counts, events };
}

const scope = (ctx: ServiceContext, projectId: string) => {
  const v = viewerOf(ctx);
  if (v) assertCan(v, "delivery:proposal:push", { projectId });
};

const pushRow = (tx: Tx, ctx: ServiceContext, p: Omit<Plan, "records">, c: Counts, outcome: "applied" | "refused", reason: string | null) =>
  tx.execute(sql`insert into delivery.sync_push (tenant_id, project_id, actor_id, actor_kind, for_user_id, repo_url, ref, sha, committed_at, outcome, created, updated, unchanged, skipped, reason)
    values (${ctx.tenantId}, ${p.projectId}, ${ctx.actor.id}, ${ctx.actor.kind}, ${forUserOf(ctx)}, ${p.repoUrl}, ${p.ref}, ${p.sha}, ${p.committedAt}, ${outcome},
            ${c.created}, ${c.updated}, ${c.unchanged}, ${JSON.stringify(c.skipped)}::jsonb, ${reason}) returning id`);

const applied = defineService({
  scoped: true,
  name: "delivery.sync.push",
  action: "delivery:proposal:push",
  resource: "delivery.sync_push",
  input: Plan,
  async run(tx, p, ctx) {
    scope(ctx, p.projectId);
    const { counts, events } = await applyPush(tx, p, ctx);
    const [row] = await pushRow(tx, ctx, p, counts, "applied", null);
    return { result: counts, resourceId: row.id as string, after: { ref: p.ref, sha: p.sha, created: counts.created, updated: counts.updated, skipped: counts.skipped }, events };
  },
});

// A refused push is its own audited write, so the refusal is on record although nothing synced.
const refused = defineService({
  scoped: true,
  name: "delivery.sync.refuse",
  action: "delivery:proposal:push",
  resource: "delivery.sync_push",
  input: Plan.omit({ records: true }).extend({ reason: z.string() }),
  async run(tx, p, ctx) {
    scope(ctx, p.projectId);
    const [row] = await pushRow(tx, ctx, p, { created: 0, updated: 0, unchanged: 0, skipped: [] }, "refused", p.reason);
    return { result: null, resourceId: row.id as string, after: { ref: p.ref, sha: p.sha, reason: p.reason } };
  },
});

class Preview extends Error {
  constructor(readonly counts: Counts) { super("preview"); }
}

// The same writes as an apply, rolled back: the preview can't disagree with what an apply would do.
const preview = (p: Plan, ctx: ServiceContext) =>
  getRuntime().db.transaction(async (tx) => {
    await setTenant(tx, ctx.tenantId);
    throw new Preview((await applyPush(tx, p, ctx)).counts);
  }).then(() => { throw new Error("unreachable"); }, (e: unknown) => { if (e instanceof Preview) return e.counts; throw e; });

/** sync_specclaw: preview (dryRun, the default) or apply a push, after amax's checks. */
export async function pushSpecclaw(viewer: Viewer, raw: z.input<typeof PushInput>, source: Source = "mcp"): Promise<PushResult> {
  const input = PushInput.parse(raw);
  const [p] = await getRuntime().db.transaction(async (tx) => { await setTenant(tx, viewer.tenantId); return tx.execute(sql`select id, repo_url from delivery.project where key = ${input.projectKey}`); });
  if (!p) throw new Error(`no project ${input.projectKey}: a PM creates it and links its repo first`);
  if (!can(viewer, "delivery:proposal:push", { projectId: p.id as string })) throw new ForbiddenError("delivery:proposal:push", `project ${input.projectKey}`);
  const ctx = ctxFor(viewer, source);
  const plan: Plan = { projectId: p.id as string, projectKey: input.projectKey, repoUrl: normaliseRepo(input.repoUrl), ref: input.ref, sha: input.sha, committedAt: input.committedAt, records: input.records };
  const reason = !p.repo_url ? `${input.projectKey} has no linked repo: ask its PM to link ${plan.repoUrl}` : p.repo_url !== plan.repoUrl ? `repo not linked to ${input.projectKey} (${plan.repoUrl})` : null;
  const none = { created: 0, updated: 0, unchanged: 0, skipped: [] as string[] };
  if (reason) {
    const { records: _, ...where } = plan;
    if (!input.dryRun) await refused(ctx, { ...where, reason });
    return { outcome: "refused", projectKey: input.projectKey, reason, ...none };
  }
  const counts = await preview(plan, ctx);
  // Nothing to write: no transaction, row or audit, so a scheduled push that finds nothing new leaves no trace.
  if (input.dryRun || !(counts.created || counts.updated)) return { outcome: input.dryRun ? "preview" : "applied", projectKey: input.projectKey, reason: null, ...counts };
  return { outcome: "applied", projectKey: input.projectKey, reason: null, ...(await applied(ctx, plan)) };
}
