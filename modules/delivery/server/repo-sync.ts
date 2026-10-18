import { sql } from "drizzle-orm";
import { z } from "zod";
import { withTenant, type Tx } from "@amax/db";
import { assertCan, can, viewerOf, type Viewer } from "@amax/auth";
import { defineService, ForbiddenError, getRuntime, type Source } from "@amax/core/server";
import { PHASES } from "../contracts";
import { syncSpecclaw } from "../sync/import";
import { byLine, forUserOf, whoJoins } from "./activity";
import { ctxFor } from "./context";
import { TaskInput } from "./tasks";

// 062: the amax plugin pushes a repo's specclaw state from a developer's machine. amax decides what
// it accepts: the project's linked repo only, a person on that project, no older commit than the last
// one applied from the same branch, and nothing Released (that comes from Prod deployments).

/** "https://user@GitHub.com/Example/Portal.git" and "git@github.com:example/portal" are both "github.com/example/portal". */
export const normaliseRepo = (url: string) =>
  url.trim().toLowerCase().replace(/^[a-z+]+:\/\//, "").replace(/^[^@/]+@/, "").replace(/^([^/:]+):(?!\d+\/)/, "$1/").replace(/^([^/:]+):\d+\//, "$1/").replace(/\.git$/, "").replace(/\/+$/, "");

export const linkProjectRepo = defineService({
  scoped: true,
  name: "delivery.project.repo",
  action: "delivery:project:link",
  resource: "delivery.project",
  input: z.object({ projectKey: z.string(), repoUrl: z.string().min(3).max(300).nullable() }),
  async run(tx, input, ctx) {
    const [p] = await tx.execute(sql`select id, repo_url from delivery.project where key = ${input.projectKey}`);
    if (!p) throw new Error(`no project ${input.projectKey}`);
    const v = viewerOf(ctx);
    if (v) assertCan(v, "delivery:project:link", { projectId: p.id as string });
    const repoUrl = input.repoUrl ? normaliseRepo(input.repoUrl) : null;
    if (repoUrl !== null && !/^[a-z0-9.-]+\/[^\s]+$/.test(repoUrl)) throw new Error(`${input.repoUrl} isn't a repo URL`);
    await tx.execute(sql`update delivery.project set repo_url = ${repoUrl} where id = ${p.id}`);
    return { result: { projectKey: input.projectKey, repoUrl }, resourceId: p.id as string, before: { repoUrl: p.repo_url }, after: { repoUrl } };
  },
});

const PushRow = z.object({
  projectId: z.string().uuid(), repoUrl: z.string(), ref: z.string(), sha: z.string(), committedAt: z.string(), outcome: z.enum(["applied", "refused"]),
  created: z.number().int(), updated: z.number().int(), unchanged: z.number().int(), skipped: z.array(z.string()), reason: z.string().nullable(),
});

// Each applied or refused push is its own audited write, so a refusal is on record although nothing synced.
const recordPush = defineService({
  scoped: true,
  name: "delivery.sync.push",
  action: "delivery:proposal:sync",
  resource: "delivery.sync_push",
  input: PushRow,
  async run(tx, i, ctx) {
    const [r] = await tx.execute(sql`insert into delivery.sync_push (tenant_id, project_id, actor_id, actor_kind, for_user_id, repo_url, ref, sha, committed_at, outcome, created, updated, unchanged, skipped, reason)
      values (${ctx.tenantId}, ${i.projectId}, ${ctx.actor.id}, ${ctx.actor.kind}, ${forUserOf(ctx)}, ${i.repoUrl}, ${i.ref}, ${i.sha}, ${i.committedAt}, ${i.outcome},
              ${i.created}, ${i.updated}, ${i.unchanged}, ${JSON.stringify(i.skipped)}::jsonb, ${i.reason}) returning id`);
    return { result: { id: r.id as string }, resourceId: r.id as string, after: i };
  },
});

const text = (n: number) => z.string().max(n);
const SpecRecordInput = z.object({
  number: z.string().regex(/^\d{3,6}$/), dir: z.string().regex(/^\d{3,6}-[a-z0-9][a-z0-9-]{0,99}$/), title: text(200).min(1), lane: text(80), module: text(200),
  phase: z.enum(PHASES), approved: z.boolean(), claim: text(80).nullable(), hard: z.array(text(8)).max(50), optional: z.array(text(8)).max(50),
  tasksDone: z.number().int().min(0).max(500), tasksTotal: z.number().int().min(0).max(500), tasks: z.array(TaskInput).max(500), acs: z.number().int().min(0).max(500),
  pr: z.string().url().max(300).nullable(), verdict: text(20).nullable(), done: z.boolean(), status: z.enum(["done", "claimed", "not approved", "blocked", "ready"]),
  waiting: z.array(text(8)).max(50), updatedAt: text(40).nullable(), releasedAt: text(40).nullable(), source: text(300), unreadable: z.boolean(),
});

export const MAX_PUSH = 200;
export const PushInput = z.object({
  projectKey: z.string(), repoUrl: z.string().min(3).max(300), ref: z.string().min(1).max(200), sha: z.string().regex(/^[0-9a-f]{7,40}$/i),
  committedAt: z.string().datetime({ offset: true }), dryRun: z.boolean().default(true), records: z.array(SpecRecordInput).max(MAX_PUSH),
});
export type PushResult = { outcome: "preview" | "applied" | "refused"; projectKey: string; reason: string | null; created: number; updated: number; unchanged: number; skipped: string[] };

async function lastApplied(tx: Tx, projectId: string, ref: string) {
  const [r] = await tx.execute(sql`select sha, committed_at from delivery.sync_push where project_id = ${projectId} and ref = ${ref} and outcome = 'applied' order by committed_at desc limit 1`);
  return r as { sha: string; committed_at: string } | undefined;
}

/** sync_specclaw: preview (dryRun, the default) or apply a push, after amax's checks. */
export async function pushSpecclaw(viewer: Viewer, raw: z.input<typeof PushInput>, source: Source = "mcp"): Promise<PushResult> {
  const input = PushInput.parse(raw);
  const db = getRuntime().db;
  const [p] = await withTenant(db, viewer.tenantId, (tx) => tx.execute(sql`select id, key, name, client, repo_url from delivery.project where key = ${input.projectKey}`));
  if (!p) throw new Error(`no project ${input.projectKey}: a PM creates it and links its repo first`);
  if (!can(viewer, "delivery:proposal:sync", { projectId: p.id as string })) throw new ForbiddenError("delivery:proposal:sync", `project ${input.projectKey}`);
  const ctx = ctxFor(viewer, source);
  const repoUrl = normaliseRepo(input.repoUrl);
  const row = { projectId: p.id as string, repoUrl, ref: input.ref, sha: input.sha, committedAt: input.committedAt };
  const none = { created: 0, updated: 0, unchanged: 0, skipped: [] as string[] };
  const refuse = async (reason: string): Promise<PushResult> => {
    if (!input.dryRun) await recordPush(ctx, { ...row, ...none, outcome: "refused", reason });
    return { outcome: "refused", projectKey: input.projectKey, reason, ...none };
  };
  if (!p.repo_url) return refuse(`${input.projectKey} has no linked repo: ask its PM to link ${repoUrl}`);
  if (p.repo_url !== repoUrl) return refuse(`repo not linked to ${input.projectKey} (${repoUrl})`);
  const last = await withTenant(db, viewer.tenantId, (tx) => lastApplied(tx, p.id as string, input.ref));
  if (last && new Date(last.committed_at) > new Date(input.committedAt)) return refuse(`stale: ${input.sha.slice(0, 7)} is older than ${last.sha.slice(0, 7)}, already synced from ${input.ref}`);
  const records = input.records.map((r) => ({ ...r, source: `${input.ref}@${input.sha}` }));
  const r = await syncSpecclaw(db, ctx, { projectKey: input.projectKey, projectName: p.name as string, client: p.client as string, records, sha: input.sha, dryRun: input.dryRun, push: true });
  const counts = { created: r.created, updated: r.updated, unchanged: r.unchanged, skipped: r.skipped };
  // Nothing changed: no row and no audit, so a scheduled push that finds nothing new leaves no trace.
  if (!input.dryRun && (r.created || r.updated || r.skipped.length)) await recordPush(ctx, { ...row, ...counts, outcome: "applied", reason: null });
  return { outcome: input.dryRun ? "preview" : "applied", projectKey: input.projectKey, reason: null, ...counts };
}

const read = <T>(viewer: Viewer, fn: (tx: Tx) => Promise<T>) => {
  if (!can(viewer, "delivery:read")) throw new ForbiddenError("delivery:read", "delivery");
  return withTenant(getRuntime().db, viewer.tenantId, fn);
};

// Pushes only arrive through the plugin's MCP call, so a person's own push is Claude acting for them.
const pushBy = (r: Record<string, unknown>) => (r.actor_kind === "user" ? `Claude for ${String(r.actor_name ?? "someone")}` : byLine(r as never));

export type PushRow = { id: string; at: string; by: string; ref: string; sha: string; outcome: "applied" | "refused"; created: number; updated: number; unchanged: number; skipped: string[]; reason: string | null; projectKey: string };
const push = (r: Record<string, unknown>): PushRow => ({
  id: r.id as string, at: new Date(r.at as string).toISOString(), by: pushBy(r), ref: r.ref as string, sha: r.sha as string, outcome: r.outcome as PushRow["outcome"],
  created: Number(r.created), updated: Number(r.updated), unchanged: Number(r.unchanged), skipped: r.skipped as string[], reason: (r.reason as string | null) ?? null, projectKey: r.project_key as string,
});
const pushes = (where: ReturnType<typeof sql>, limit: number) => sql`select a.*, pr.key as project_key, au.name as actor_name, sp.name as principal_name, fu.name as for_name
  from delivery.sync_push a join delivery.project pr on pr.id = a.project_id ${whoJoins} where ${where} order by a.at desc limit ${limit}`;

/** A project's Repo sync card: its linked repo and recent pushes, newest first. */
export const getRepoSync = (viewer: Viewer, a: { projectId?: string; projectKey?: string }) => read(viewer, async (tx) => {
  const [p] = await tx.execute(a.projectId ? sql`select id, key, name, repo_url from delivery.project where id = ${a.projectId}` : sql`select id, key, name, repo_url from delivery.project where key = ${a.projectKey ?? ""}`);
  if (!p) return null;
  const recent = (await tx.execute(pushes(sql`a.project_id = ${p.id}`, 20))).map(push);
  return { project: { id: p.id as string, key: p.key as string, name: p.name as string }, repoUrl: (p.repo_url as string | null) ?? null, lastApplied: recent.find((x) => x.outcome === "applied") ?? null, recent };
});

/** One push, for its pin. */
export const getSyncPush = (viewer: Viewer, id: string) => read(viewer, async (tx) => (await tx.execute(pushes(sql`a.id = ${id}`, 1))).map(push)[0] ?? null);
