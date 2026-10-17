import { sql } from "drizzle-orm";
import { z } from "zod";
import { withTenant } from "@amax/db";
import { can, type Viewer } from "@amax/auth";
import { defineService, ForbiddenError, getRuntime, type Source } from "@amax/core/server";
import * as delivery from "@amax/delivery/contracts";
import { EVENTS, getOpportunityRef, numberOf, type OpportunityPromoted } from "../contracts";
import { actorOf, lockOpportunity, NUMBER } from "./common";
import { ctxFor } from "./context";

export type ProjectInput = { key: string; name: string; client: string; billing: "fixed" | "t&m" | "retainer"; managerName?: string };
export type CreateProject = (ctx: ReturnType<typeof ctxFor>, input: ProjectInput) => Promise<{ id: string; key: string }>;

/** Delivery's published project creation, or null while its contract doesn't offer one. */
export function deliveryCreateProject(): CreateProject | null {
  const create = (delivery as unknown as Record<string, unknown>).createProject;
  return typeof create === "function" ? (create as CreateProject) : null;
}

export class PromotionUnavailableError extends Error {
  readonly retryable = false;
  constructor() {
    super("Delivery doesn't offer project creation through its contract yet, so this can't be promoted here");
    this.name = "PromotionUnavailableError";
  }
}

export const promoteInput = z.object({ number: z.string().regex(NUMBER), key: z.string().regex(/^[A-Z][A-Z0-9]{1,9}$/, "2–10 capitals or digits, e.g. NWI"), billing: z.enum(["fixed", "t&m", "retainer"]) });

/** How long a promotion attempt holds its claim before another attempt may take over. */
export const CLAIM_SECONDS = 120;

/**
 * Claims a won opportunity for promotion under its row lock, before delivery is asked for anything:
 * a second promote while one is in flight is refused, so two attempts never both create a project.
 * A stale claim with the same key is resumed (its project may already exist); with another key it is
 * replaced only when delivery never created the claimed project.
 */
export const claimPromotion = defineService({
  name: "presales.opportunity.promote.claim",
  action: "presales:promote",
  resource: "presales.opportunity",
  input: z.object({ number: z.string().regex(NUMBER), key: z.string() }),
  async run(tx, input) {
    const o = await lockOpportunity(tx, input.number);
    if (o.stage !== "won") throw new Error(`${input.number} isn't won yet; only won opportunities become projects`);
    if (o.project_id) throw new Error(`${input.number} is already project ${o.project_key}`);
    if (o.claim_key) {
      const [{ fresh }] = await tx.execute(sql`select ${o.claimed_at}::timestamptz > now() - make_interval(secs => ${CLAIM_SECONDS}) as fresh`);
      if (fresh) throw new Error(`${input.number} is being promoted as ${o.claim_key} right now; try again in a couple of minutes`);
      if (o.claim_key !== input.key && (await delivery.getProjectRef(tx, o.claim_key as string))) throw new Error(`${input.number} was promoted as ${o.claim_key}; promote it with that key to finish`);
    }
    const resumed = o.claim_key === input.key;
    const [c] = await tx.execute(sql`update presales.opportunity set claim_key = ${input.key}, claim_token = gen_random_uuid(), claimed_at = now() where id = ${o.id} returning claim_token`);
    return { result: { token: c.claim_token as string, resumed }, resourceId: o.id as string, before: { claim: o.claim_key }, after: { claim: input.key } };
  },
});

/** Gives up a claim this attempt still holds, after delivery refused to create the project. */
export const releasePromotion = defineService({
  name: "presales.opportunity.promote.release",
  action: "presales:promote",
  resource: "presales.opportunity",
  input: z.object({ number: z.string().regex(NUMBER), token: z.string().uuid() }),
  async run(tx, input) {
    const o = await lockOpportunity(tx, input.number);
    const [r] = await tx.execute(sql`update presales.opportunity set claim_key = null, claim_token = null, claimed_at = null where id = ${o.id} and claim_token = ${input.token} returning id`);
    return { result: { released: Boolean(r) }, resourceId: o.id as string };
  },
});

/** Links a won opportunity to the project delivery created for it under this attempt's claim, and says so on the outbox. */
export const recordPromotion = defineService({
  name: "presales.opportunity.promote",
  action: "presales:promote",
  resource: "presales.opportunity",
  input: z.object({ number: z.string().regex(NUMBER), token: z.string().uuid(), projectId: z.string().uuid(), projectKey: z.string() }),
  async run(tx, input, ctx) {
    const o = await lockOpportunity(tx, input.number);
    if (o.claim_token !== input.token || o.claim_key !== input.projectKey) throw new Error(`${input.number} is no longer claimed for ${input.projectKey}; promote it again`);
    // The unique index on project_id refuses a project another opportunity already holds.
    await tx.execute(sql`update presales.opportunity set project_id = ${input.projectId}, project_key = ${input.projectKey}, claim_key = null, claim_token = null, claimed_at = null, updated_at = now() where id = ${o.id}`);
    const [c] = await tx.execute(sql`select name from presales.client where id = ${o.client_id}`);
    const payload: OpportunityPromoted = {
      opportunityId: o.id as string, number: numberOf(Number(o.number)), projectId: input.projectId, projectKey: input.projectKey, by: actorOf(ctx), client: c.name as string,
      costCentre: (o.cost_centre as string | null) ?? null, estimateDays: o.estimate_days === null ? null : Number(o.estimate_days), ownerName: (o.owner_name as string | null) ?? null,
      leadName: (o.lead_name as string | null) ?? null, valueUsd: { amount: String(o.value_usd), currency: "USD" },
    };
    return { result: { number: input.number, projectKey: input.projectKey }, resourceId: o.id as string, before: { projectId: null }, after: { projectId: input.projectId, projectKey: input.projectKey }, events: [{ name: EVENTS.promoted, payload }] };
  },
});

/**
 * Promote to delivery: claim the opportunity, have delivery create the project through its contract
 * (its own service, audit and permission check), then link it. A resumed claim whose project already
 * exists (the link failed last time) links that project instead of creating another.
 */
export async function promoteToDelivery(viewer: Viewer, raw: unknown, opts: { source?: Source; create?: CreateProject | null } = {}) {
  const create = opts.create === undefined ? deliveryCreateProject() : opts.create;
  if (!can(viewer, "presales:promote")) throw new ForbiddenError("presales:promote", "presales.opportunity");
  const input = promoteInput.parse(raw);
  if (!create) throw new PromotionUnavailableError();
  const ctx = ctxFor(viewer, opts.source);
  const claim = await claimPromotion(ctx, { number: input.number, key: input.key });
  let project: { id: string; key: string } | null = null;
  try {
    const { opp, existing } = await withTenant(getRuntime().db, viewer.tenantId, async (tx) => ({ opp: (await getOpportunityRef(tx, input.number))!, existing: await delivery.getProjectRef(tx, input.key) }));
    if (existing && !claim.resumed) throw new Error(`delivery already has a project ${input.key}; choose another key`);
    project = existing ?? (await create(ctx, { key: input.key, name: opp.title, client: opp.client, billing: input.billing }));
    return await recordPromotion(ctx, { number: input.number, token: claim.token, projectId: project.id, projectKey: project.key });
  } catch (e) {
    // No project yet: give the claim back. A project made under this claim keeps it, so a later
    // promote with the same key resumes and links that project.
    if (!project) await releasePromotion(ctx, { number: input.number, token: claim.token }).catch(() => undefined);
    throw e;
  }
}
