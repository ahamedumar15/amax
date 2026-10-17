import { sql } from "drizzle-orm";
import { z } from "zod";
import type { Tx } from "@amax/db";
import { assertCan, viewerOf } from "@amax/auth";
import { appendAudit, defineService, type Emitted, type ServiceContext } from "@amax/core/server";
import { EVENTS, PHASES, type Phase, type ProposalPhaseChanged, type ProposalRekeyed, type ReleaseDeployed } from "../contracts";

const by = (ctx: ServiceContext) => ctx.onBehalfOf ? `${ctx.actor.id} for ${ctx.onBehalfOf}` : ctx.actor.id;

// Data scope: once the project is known, the viewer must be allowed to act on that project.
function scoped(ctx: ServiceContext, action: string, projectId: string) {
  const v = viewerOf(ctx);
  if (v) assertCan(v, action, { projectId });
}

async function projectByKey(tx: Tx, key: string) {
  const [p] = await tx.execute(sql`select * from delivery.project where key = ${key}`);
  if (!p) throw new Error(`no project ${key}`);
  return p;
}

export const DEFAULT_ENVIRONMENTS = ["Dev", "QA", "UAT", "Prod"];

async function ensureEnvironments(tx: Tx, tenantId: string, projectId: string) {
  for (const [i, name] of DEFAULT_ENVIRONMENTS.entries()) {
    await tx.execute(sql`insert into delivery.environment (tenant_id, project_id, name, position, is_prod)
      values (${tenantId}, ${projectId}, ${name}, ${i + 1}, ${name === "Prod"}) on conflict do nothing`);
  }
}

// One rule for putting proposals in a release (createRelease and setReleaseProposals): every key
// must exist in the project, a proposal already shipped in another release can't be moved, and a
// release that is already live in Prod takes no new proposals, since they'd never become Released
// (final review): ship them in a new release.
async function assignProposals(tx: Tx, projectId: unknown, releaseId: unknown, keys: string[]) {
  const [{ live }] = await tx.execute(sql`select count(*)::int as live from delivery.deployment where release_id = ${releaseId} and released and voided_at is null`);
  for (const key of keys) {
    const [p] = await tx.execute(sql`select id, phase, release_id from delivery.proposal where key = ${key} and project_id = ${projectId}`);
    if (!p) throw new Error(`no proposal ${key} in this project`);
    if (p.phase === "released" && p.release_id !== releaseId) throw new Error(`${key} already shipped in another release`);
    if (Number(live) > 0 && p.release_id !== releaseId) throw new Error(`this release is already live in Prod; put ${key} in a new release`);
    await tx.execute(sql`update delivery.proposal set release_id = ${releaseId} where id = ${p.id}`);
  }
}

// Every write that reads a release locks its row, so a Prod deployment and a change to its proposals
// can't interleave: proposals added to a release are either released with it or refused (final review).
async function releaseOf(tx: Tx, projectId: unknown, version: string) {
  const [r] = await tx.execute(sql`select * from delivery.release where project_id = ${projectId} and version = ${version} for update`);
  if (!r) throw new Error(`no release ${version}`);
  return r;
}

const phaseEvent = (p: Record<string, unknown>, to: Phase, ctx: ServiceContext): Emitted => ({
  name: EVENTS.proposalPhaseChanged,
  payload: { proposalId: p.id as string, key: p.key as string, projectId: p.project_id as string, from: p.phase as Phase, to, by: by(ctx) } satisfies ProposalPhaseChanged,
});

export const createProject = defineService({
  name: "delivery.project.create",
  action: "delivery:project:create",
  resource: "delivery.project",
  input: z.object({
    key: z.string().regex(/^[A-Z][A-Z0-9]{1,9}$/, "2–10 capitals or digits, e.g. CON"),
    name: z.string().min(1),
    client: z.string().min(1),
    billing: z.enum(["fixed", "t&m", "retainer", "internal"]),
    managerName: z.string().optional(),
  }),
  async run(tx, input, ctx) {
    const [p] = await tx.execute(sql`insert into delivery.project (tenant_id, key, name, client, billing, manager_name, manager_user_id)
      values (${ctx.tenantId}, ${input.key}, ${input.name}, ${input.client}, ${input.billing}, ${input.managerName ?? null},
              ${viewerOf(ctx)?.userId ?? null}) returning id, key`);
    await ensureEnvironments(tx, ctx.tenantId, p.id as string);
    return { result: { id: p.id as string, key: p.key as string }, resourceId: p.id as string, after: input };
  },
});

/**
 * The next key for a proposal made by hand. In a project synced from specclaw the numeric keys belong
 * to spec changes (AMX-042 is change 042, at any number), so hand-made ones get their own series,
 * AMX-H001, and the two can never collide (review rounds 4 and 5). Call with the project row locked.
 */
async function nextHandKey(tx: Tx, projectId: string, projectKey: string, syncing = false) {
  const [{ synced, num, hand }] = await tx.execute(sql`select bool_or(source = 'specclaw') as synced,
      coalesce(max(substring(key from '-(\\d+)$')::int), 0) as num, coalesce(max(substring(key from '-H(\\d+)$')::int), 0) as hand
    from delivery.proposal where project_id = ${projectId}`);
  return synced || syncing ? `${projectKey}-H${String(Number(hand) + 1).padStart(3, "0")}` : `${projectKey}-${String(Number(num) + 1).padStart(3, "0")}`;
}

export const createProposal = defineService({
  scoped: true,
  name: "delivery.proposal.create",
  action: "delivery:proposal:create",
  resource: "delivery.proposal",
  input: z.object({ projectKey: z.string(), title: z.string().min(1), estimateHours: z.number().nonnegative().optional(), ownerName: z.string().optional() }),
  async run(tx, input, ctx) {
    const project = await projectByKey(tx, input.projectKey);
    scoped(ctx, "delivery:proposal:create", project.id as string);
    // Next key in the project: CON-018 after CON-017. The project row lock serialises concurrent
    // creates, so two of them can't compute the same key (review round 1, B7).
    await tx.execute(sql`select 1 from delivery.project where id = ${project.id} for update`);
    const key = await nextHandKey(tx, project.id as string, project.key as string);
    const [p] = await tx.execute(sql`insert into delivery.proposal (tenant_id, project_id, key, title, estimate_hours, owner_name)
      values (${ctx.tenantId}, ${project.id}, ${key}, ${input.title}, ${input.estimateHours ?? null}, ${input.ownerName ?? null}) returning id`);
    return { result: { id: p.id as string, key }, resourceId: p.id as string, after: { key, ...input } };
  },
});

// The board's explicit Move action. Released is reached only through a Prod deployment.
export const moveProposal = defineService({
  scoped: true,
  name: "delivery.proposal.move",
  action: "delivery:proposal:move",
  resource: "delivery.proposal",
  input: z.object({ key: z.string(), to: z.enum(PHASES.filter((p) => p !== "released") as [Phase, ...Phase[]]) }),
  async run(tx, input, ctx) {
    const [p] = await tx.execute(sql`select * from delivery.proposal where key = ${input.key}`);
    if (!p) throw new Error(`no proposal ${input.key}`);
    scoped(ctx, "delivery:proposal:move", p.project_id as string);
    if (p.phase === "released") throw new Error(`${input.key} is in Prod; it can't move back on the board`);
    if (p.phase === input.to) return { result: { key: input.key, phase: input.to }, resourceId: p.id as string };
    await tx.execute(sql`update delivery.proposal set phase = ${input.to}, updated_at = now() where id = ${p.id}`);
    return {
      result: { key: input.key, phase: input.to },
      resourceId: p.id as string,
      before: { phase: p.phase },
      after: { phase: input.to },
      events: [phaseEvent(p, input.to, ctx)],
    };
  },
});

export const createRelease = defineService({
  scoped: true,
  name: "delivery.release.create",
  action: "delivery:release:create",
  resource: "delivery.release",
  input: z.object({ projectKey: z.string(), version: z.string().min(1), proposalKeys: z.array(z.string()).default([]) }),
  async run(tx, input, ctx) {
    const project = await projectByKey(tx, input.projectKey);
    scoped(ctx, "delivery:release:create", project.id as string);
    // A version that exists (or is being created right now) is refused clearly, not as a raw unique violation.
    const [r] = await tx.execute(sql`insert into delivery.release (tenant_id, project_id, version) values (${ctx.tenantId}, ${project.id}, ${input.version})
      on conflict (project_id, version) do nothing returning id`);
    if (!r) throw new Error(`${input.projectKey} already has a release ${input.version}`);
    await assignProposals(tx, project.id, r.id, input.proposalKeys);
    return { result: { id: r.id as string }, resourceId: r.id as string, after: input };
  },
});

// A pipeline, an agent or a person records a deployment. Reaching Prod releases its proposals.
export const recordDeployment = defineService({
  scoped: true,
  name: "delivery.deployment.record",
  action: "delivery:deployment:record",
  resource: "delivery.deployment",
  input: z.object({
    projectKey: z.string(),
    version: z.string(),
    environment: z.string(),
    status: z.enum(["deployed", "testing", "rolled-back"]).default("deployed"),
    note: z.string().optional(),
    pipelineRun: z.string().optional(),
  }),
  async run(tx, input, ctx) {
    const project = await projectByKey(tx, input.projectKey);
    scoped(ctx, "delivery:deployment:record", project.id as string);
    const release = await releaseOf(tx, project.id, input.version);
    // 042: any environment of this project, not only the next one; matched by name, as pipelines report it.
    const env = await envByName(tx, project.id, input.environment);
    if (!env) throw new Error(`${input.projectKey} has no environment ${input.environment}`);
    const released = Boolean(env.is_prod) && input.status === "deployed";
    const [d] = await tx.execute(sql`insert into delivery.deployment (tenant_id, release_id, environment_id, status, note, pipeline_run, recorded_by, released)
      values (${ctx.tenantId}, ${release.id}, ${env.id}, ${input.status}, ${input.note ?? null}, ${input.pipelineRun ?? null}, ${by(ctx)}, ${released}) returning id`);
    const events: Emitted[] = [{
      name: EVENTS.releaseDeployed,
      payload: { releaseId: release.id as string, projectId: project.id as string, version: input.version, environment: env.name as string, status: input.status, released } satisfies ReleaseDeployed,
    }];
    if (released) {
      const moved = await tx.execute(sql`select * from delivery.proposal where release_id = ${release.id} and phase <> 'released'`);
      await tx.execute(sql`update delivery.proposal set phase = 'released', released_at = now(), updated_at = now() where release_id = ${release.id} and phase <> 'released'`);
      events.push(...moved.map((p) => phaseEvent(p, "released", ctx)));
    }
    return { result: { id: d.id as string, released }, resourceId: d.id as string, after: input, events };
  },
});

// 039 self-sync (and later 008 ingestion): upsert one proposal from an external source. Called only
// when something changed, so an unchanged re-sync writes and audits nothing.
/** The key is held by a proposal the sync may not move; the spec change is reported, not synced. */
export class KeyTakenError extends Error {
  readonly retryable = false;
  constructor(key: string, why: string) {
    super(`${key} belongs to another proposal and can't be moved: ${why}`);
    this.name = "KeyTakenError";
  }
}

export const syncProposal = defineService({
  name: "delivery.proposal.sync",
  action: "delivery:proposal:sync",
  resource: "delivery.proposal",
  input: z.object({
    projectKey: z.string(),
    project: z.object({ name: z.string(), client: z.string() }),
    key: z.string(),
    title: z.string(),
    phase: z.enum(PHASES),
    tasksDone: z.number().int().nonnegative(),
    tasksTotal: z.number().int().nonnegative(),
    source: z.string(),
    sourceRef: z.string(),
    releasedAt: z.string().nullable(),
    meta: z.record(z.string(), z.unknown()),
  }),
  async run(tx, input, ctx) {
    let [project] = await tx.execute(sql`select * from delivery.project where key = ${input.projectKey}`);
    if (!project) {
      [project] = await tx.execute(sql`insert into delivery.project (tenant_id, key, name, client, billing, color, sprint)
        values (${ctx.tenantId}, ${input.projectKey}, ${input.project.name}, ${input.project.client}, 'internal', 'mint', 'specclaw waves') returning *`);
      await ensureEnvironments(tx, ctx.tenantId, project.id as string);
    }
    // The project row lock serialises this with createProposal's key computation (review round 2).
    await tx.execute(sql`select 1 from delivery.project where id = ${project.id} for update`);
    const [found] = await tx.execute(sql`select * from delivery.proposal where key = ${input.key}`);
    // A proposal made by hand (no source) before the project was synced can sit on a spec change's
    // key. While it's unreleased it moves to the hand-made series, as its own audited write with its
    // own event, so the spec change can sync; releases and history follow it by id. A released one
    // keeps its key (shipped history isn't renamed), and so does one from another source: the spec
    // change is then refused and reported (review rounds 5 and 6).
    let rekeyed: { from: string; to: string } | null = null;
    const events: Emitted[] = [];
    if (found && found.source !== input.source) {
      if (found.source !== null || found.phase === "released") throw new KeyTakenError(input.key, found.source === null ? "it was released by hand" : `it comes from ${found.source}`);
      const to = await nextHandKey(tx, project.id as string, project.key as string, true);
      await tx.execute(sql`update delivery.proposal set key = ${to}, updated_at = now() where id = ${found.id}`);
      await appendAudit(tx, ctx, { action: "delivery.proposal.rekey", resource: "delivery.proposal", resourceId: found.id as string, before: { key: input.key }, after: { key: to, reason: `spec change ${input.key} owns the key` } });
      events.push({ name: EVENTS.proposalRekeyed, payload: { proposalId: found.id as string, projectId: project.id as string, from: input.key, to } satisfies ProposalRekeyed });
      rekeyed = { from: input.key, to };
    }
    const before = rekeyed ? undefined : found;
    const meta = JSON.stringify(input.meta);
    const [row] = await tx.execute(sql`insert into delivery.proposal (tenant_id, project_id, key, title, phase, tasks_done, tasks_total, agent, source, source_ref, released_at, meta, updated_at)
      values (${ctx.tenantId}, ${project.id}, ${input.key}, ${input.title}, ${input.phase}, ${input.tasksDone}, ${input.tasksTotal}, 'specclaw', ${input.source}, ${input.sourceRef},
              ${input.releasedAt}, ${meta}::jsonb, now())
      on conflict (tenant_id, key) do update set title = excluded.title, phase = excluded.phase, tasks_done = excluded.tasks_done, tasks_total = excluded.tasks_total,
        source_ref = excluded.source_ref, released_at = coalesce(delivery.proposal.released_at, excluded.released_at), meta = excluded.meta, updated_at = now()
        where delivery.proposal.source = excluded.source
      returning *`);
    if (!row) throw new Error(`${input.key} could not be synced`);
    if (before && before.phase !== input.phase) events.push(phaseEvent(before, input.phase, ctx));
    return {
      result: { key: input.key, created: !before, phaseChanged: events.some((e) => e.name === EVENTS.proposalPhaseChanged) },
      resourceId: row.id as string,
      before: before ? { phase: before.phase, tasksDone: before.tasks_done, title: before.title } : null,
      after: { phase: input.phase, tasksDone: input.tasksDone, title: input.title, sha: input.meta.sha, ...(rekeyed ? { rekeyed } : {}) },
      events,
    };
  },
});

// ---- 042 release management -------------------------------------------------------------------

// Environment names match without regard to case everywhere ("Prod" is "prod"), backed by a unique
// index on lower(name) (migration 0008; final review).
const envByName = async (tx: Tx, projectId: unknown, name: string) =>
  (await tx.execute(sql`select * from delivery.environment where project_id = ${projectId} and lower(name) = lower(${name})`))[0];

// Add, rename, reorder or mark Prod. Marking one Prod unmarks the others; isProd false leaves none.
export const upsertEnvironment = defineService({
  scoped: true,
  name: "delivery.environment.upsert",
  action: "delivery:release:create",
  resource: "delivery.environment",
  input: z.object({ projectKey: z.string(), name: z.string().min(1).max(40), rename: z.string().min(1).max(40).optional(), position: z.number().int().min(1).optional(), isProd: z.boolean().optional() }),
  async run(tx, input, ctx) {
    const project = await projectByKey(tx, input.projectKey);
    scoped(ctx, "delivery:release:create", project.id as string);
    const before = await envByName(tx, project.id, input.name);
    const target = input.rename ? await envByName(tx, project.id, input.rename) : undefined;
    if (target && target.id !== before?.id) throw new Error(`${input.projectKey} already has an environment called ${target.name}`);
    if (input.isProd) await tx.execute(sql`update delivery.environment set is_prod = false where project_id = ${project.id}`);
    let row;
    if (before) {
      [row] = await tx.execute(sql`update delivery.environment set name = ${input.rename ?? before.name}, is_prod = ${input.isProd ?? before.is_prod} where id = ${before.id} returning *`);
    } else {
      const [{ n }] = await tx.execute(sql`select coalesce(max(position), 0) + 1 as n from delivery.environment where project_id = ${project.id}`);
      [row] = await tx.execute(sql`insert into delivery.environment (tenant_id, project_id, name, position, is_prod) values (${ctx.tenantId}, ${project.id}, ${input.rename ?? input.name}, ${n}, ${input.isProd ?? false}) returning *`);
    }
    if (input.position) {
      // Move to the requested slot and close the gaps, keeping the others in order.
      const envs = (await tx.execute(sql`select id from delivery.environment where project_id = ${project.id} and id <> ${row.id} order by position`)).map((e) => e.id as string);
      envs.splice(Math.min(input.position - 1, envs.length), 0, row.id as string);
      for (const [i, id] of envs.entries()) await tx.execute(sql`update delivery.environment set position = ${-(i + 1)} where id = ${id}`);
      await tx.execute(sql`update delivery.environment set position = -position where project_id = ${project.id}`);
    }
    return { result: { name: row.name as string }, resourceId: row.id as string, before: before ? { name: before.name, isProd: before.is_prod } : null, after: input };
  },
});

export const removeEnvironment = defineService({
  scoped: true,
  name: "delivery.environment.remove",
  action: "delivery:release:create",
  resource: "delivery.environment",
  input: z.object({ projectKey: z.string(), name: z.string() }),
  async run(tx, input, ctx) {
    const project = await projectByKey(tx, input.projectKey);
    scoped(ctx, "delivery:release:create", project.id as string);
    const env = await envByName(tx, project.id, input.name);
    if (!env) throw new Error(`no environment ${input.name}`);
    const [{ n }] = await tx.execute(sql`select count(*)::int as n from delivery.deployment where environment_id = ${env.id}`);
    // Voided records stay as history, so they count too.
    if (Number(n) > 0) throw new Error(`${env.name} has ${n} deployment record${Number(n) === 1 ? "" : "s"} (voided ones included, kept as history), so it stays`);
    await tx.execute(sql`delete from delivery.environment where id = ${env.id}`);
    return { result: { removed: env.name as string }, resourceId: env.id as string, before: { name: env.name } };
  },
});

export const tagRelease = defineService({
  scoped: true,
  name: "delivery.release.tag",
  action: "delivery:release:create",
  resource: "delivery.release",
  input: z.object({ projectKey: z.string(), version: z.string(), newVersion: z.string().min(1).max(40) }),
  async run(tx, input, ctx) {
    const project = await projectByKey(tx, input.projectKey);
    scoped(ctx, "delivery:release:create", project.id as string);
    const r = await releaseOf(tx, project.id, input.version);
    await tx.execute(sql`update delivery.release set version = ${input.newVersion} where id = ${r.id}`);
    return { result: { version: input.newVersion }, resourceId: r.id as string, before: { version: input.version }, after: { version: input.newVersion } };
  },
});

export const setReleaseProposals = defineService({
  scoped: true,
  name: "delivery.release.proposals",
  action: "delivery:release:create",
  resource: "delivery.release",
  input: z.object({ projectKey: z.string(), version: z.string(), proposalKeys: z.array(z.string()) }),
  async run(tx, input, ctx) {
    const project = await projectByKey(tx, input.projectKey);
    scoped(ctx, "delivery:release:create", project.id as string);
    const r = await releaseOf(tx, project.id, input.version);
    const before = (await tx.execute(sql`select key from delivery.proposal where release_id = ${r.id} order by key`)).map((p) => p.key as string);
    await tx.execute(sql`update delivery.proposal set release_id = null where release_id = ${r.id} and phase <> 'released'`);
    await assignProposals(tx, project.id, r.id, input.proposalKeys);
    return { result: { version: input.version, proposals: input.proposalKeys }, resourceId: r.id as string, before: { proposals: before }, after: { proposals: input.proposalKeys } };
  },
});

// A wrong record is voided with a reason, never deleted. Voiding the only Prod deployment takes
// its proposals out of Released again.
export const voidDeployment = defineService({
  scoped: true,
  name: "delivery.deployment.void",
  action: "delivery:deployment:record",
  resource: "delivery.deployment",
  // A history row voids exactly itself (deploymentId); without one, the latest live record for the
  // environment (MCP and chat, which name the environment) (final review).
  input: z.object({ projectKey: z.string(), version: z.string(), environment: z.string(), deploymentId: z.string().uuid().optional(), reason: z.string().min(3).max(500) }),
  async run(tx, input, ctx) {
    const project = await projectByKey(tx, input.projectKey);
    scoped(ctx, "delivery:deployment:record", project.id as string);
    const release = await releaseOf(tx, project.id, input.version);
    const target = input.deploymentId
      ? sql`select d.id from delivery.deployment d join delivery.environment e on e.id = d.environment_id
            where d.id = ${input.deploymentId} and d.release_id = ${release.id} and lower(e.name) = lower(${input.environment}) and d.voided_at is null`
      : sql`select d.id from delivery.deployment d join delivery.environment e on e.id = d.environment_id
            where d.release_id = ${release.id} and lower(e.name) = lower(${input.environment}) and d.voided_at is null order by d.at desc limit 1`;
    const [d] = await tx.execute(sql`update delivery.deployment set voided_at = now(), void_reason = ${input.reason}, voided_by = ${by(ctx)} where id = (${target}) returning *`);
    if (!d) throw new Error(input.deploymentId ? `that deployment isn't a live ${input.environment} record of ${input.version}` : `no deployment of ${input.version} to ${input.environment} to void`);
    const events: Emitted[] = [];
    // Only the record that released the proposals can un-release them, and only if no other live
    // record released them too. Voiding a Dev deploy, or one on an environment that has since
    // stopped being Prod, leaves Released alone.
    const [{ live }] = await tx.execute(sql`select count(*)::int as live from delivery.deployment where release_id = ${release.id} and released and voided_at is null`);
    if (d.released && Number(live) === 0) {
      const back = await tx.execute(sql`update delivery.proposal set phase = 'verified', released_at = null, updated_at = now() where release_id = ${release.id} and phase = 'released' returning *`);
      events.push(...back.map((p) => phaseEvent({ ...p, phase: "released" }, "verified", ctx)));
    }
    return { result: { voided: d.id as string, unreleased: events.length }, resourceId: d.id as string, after: input, events };
  },
});
