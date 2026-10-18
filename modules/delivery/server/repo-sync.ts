import { sql } from "drizzle-orm";
import { z } from "zod";
import { withTenant, type Tx } from "@amax/db";
import { assertCan, can, viewerOf, type Viewer } from "@amax/auth";
import { defineService, ForbiddenError, getRuntime } from "@amax/core/server";
import { byLine, whoJoins } from "./activity";

// 062: the one repo a project's specclaw pushes are accepted from (push.ts), and the project's
// Repo sync card: the linked repo and its recent pushes.

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

const read = <T>(viewer: Viewer, fn: (tx: Tx) => Promise<T>) => {
  if (!can(viewer, "delivery:read")) throw new ForbiddenError("delivery:read", "delivery");
  return withTenant(getRuntime().db, viewer.tenantId, fn);
};

// Who pushed, as recorded: the person by name (their MCP client is not known), or the credential or agent for them.
const pushBy = (r: Record<string, unknown>) => (r.actor_kind === "user" ? String(r.actor_name ?? "Someone") : byLine(r as never));

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
  // Read on its own: a run of refused pushes can fill the recent list.
  const [last] = (await tx.execute(pushes(sql`a.project_id = ${p.id} and a.outcome = 'applied'`, 1))).map(push);
  return { project: { id: p.id as string, key: p.key as string, name: p.name as string }, repoUrl: (p.repo_url as string | null) ?? null, lastApplied: last ?? null, recent };
});

/** One push, for its pin. */
export const getSyncPush = (viewer: Viewer, id: string) => read(viewer, async (tx) => (await tx.execute(pushes(sql`a.id = ${id}`, 1))).map(push)[0] ?? null);
