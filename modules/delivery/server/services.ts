import { sql } from "drizzle-orm";
import { z } from "zod";
import type { Tx } from "@amax/db";
import { assertCan, viewerOf } from "@amax/auth";
import { defineService, type Emitted, type ServiceContext } from "@amax/core/server";
import { EVENTS, PHASES, type Phase, type ProposalPhaseChanged, type ReleaseDeployed } from "../contracts";

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
    return { result: { id: p.id as string, key: p.key as string }, resourceId: p.id as string, after: input };
  },
});

export const createProposal = defineService({
  name: "delivery.proposal.create",
  action: "delivery:proposal:create",
  resource: "delivery.proposal",
  input: z.object({ projectKey: z.string(), title: z.string().min(1), estimateHours: z.number().nonnegative().optional(), ownerName: z.string().optional() }),
  async run(tx, input, ctx) {
    const project = await projectByKey(tx, input.projectKey);
    scoped(ctx, "delivery:proposal:create", project.id as string);
    // Next key in the project: CON-018 after CON-017.
    const [{ n }] = await tx.execute(sql`select coalesce(max(substring(key from '-(\\d+)$')::int), 0) + 1 as n from delivery.proposal where project_id = ${project.id}`);
    const key = `${project.key}-${String(n).padStart(3, "0")}`;
    const [p] = await tx.execute(sql`insert into delivery.proposal (tenant_id, project_id, key, title, estimate_hours, owner_name)
      values (${ctx.tenantId}, ${project.id}, ${key}, ${input.title}, ${input.estimateHours ?? null}, ${input.ownerName ?? null}) returning id`);
    return { result: { id: p.id as string, key }, resourceId: p.id as string, after: { key, ...input } };
  },
});

// The board's explicit Move action. Released is reached only through a Prod deployment.
export const moveProposal = defineService({
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
  name: "delivery.release.create",
  action: "delivery:release:create",
  resource: "delivery.release",
  input: z.object({ projectKey: z.string(), version: z.string().min(1), proposalKeys: z.array(z.string()).default([]) }),
  async run(tx, input, ctx) {
    const project = await projectByKey(tx, input.projectKey);
    scoped(ctx, "delivery:release:create", project.id as string);
    const [r] = await tx.execute(sql`insert into delivery.release (tenant_id, project_id, version) values (${ctx.tenantId}, ${project.id}, ${input.version}) returning id`);
    for (const key of input.proposalKeys) {
      await tx.execute(sql`update delivery.proposal set release_id = ${r.id} where key = ${key} and project_id = ${project.id}`);
    }
    return { result: { id: r.id as string }, resourceId: r.id as string, after: input };
  },
});

// A pipeline, an agent or a person records a deployment. Reaching Prod releases its proposals.
export const recordDeployment = defineService({
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
    const [release] = await tx.execute(sql`select * from delivery.release where project_id = ${project.id} and version = ${input.version}`);
    if (!release) throw new Error(`no release ${input.version} for ${input.projectKey}`);
    const [env] = await tx.execute(sql`select * from delivery.environment where name = ${input.environment}`);
    if (!env) throw new Error(`no environment ${input.environment}`);
    const [d] = await tx.execute(sql`insert into delivery.deployment (tenant_id, release_id, environment_id, status, note, pipeline_run, recorded_by)
      values (${ctx.tenantId}, ${release.id}, ${env.id}, ${input.status}, ${input.note ?? null}, ${input.pipelineRun ?? null}, ${by(ctx)}) returning id`);
    const released = Boolean(env.is_prod) && input.status === "deployed";
    const events: Emitted[] = [{
      name: EVENTS.releaseDeployed,
      payload: { releaseId: release.id as string, projectId: project.id as string, version: input.version, environment: input.environment, status: input.status, released } satisfies ReleaseDeployed,
    }];
    if (released) {
      const moved = await tx.execute(sql`select * from delivery.proposal where release_id = ${release.id} and phase <> 'released'`);
      await tx.execute(sql`update delivery.proposal set phase = 'released', released_at = now(), updated_at = now() where release_id = ${release.id} and phase <> 'released'`);
      events.push(...moved.map((p) => phaseEvent(p, "released", ctx)));
    }
    return { result: { id: d.id as string, released }, resourceId: d.id as string, after: input, events };
  },
});
