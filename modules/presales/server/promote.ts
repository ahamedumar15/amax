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

/** Links a won opportunity to the project delivery created for it, and says so on the outbox. */
export const recordPromotion = defineService({
  name: "presales.opportunity.promote",
  action: "presales:promote",
  resource: "presales.opportunity",
  input: z.object({ number: z.string().regex(NUMBER), projectId: z.string().uuid(), projectKey: z.string() }),
  async run(tx, input, ctx) {
    const o = await lockOpportunity(tx, input.number);
    if (o.stage !== "won") throw new Error(`${input.number} isn't won yet; only won opportunities become projects`);
    if (o.project_id && o.project_id !== input.projectId) throw new Error(`${input.number} is already project ${o.project_key}`);
    const [taken] = await tx.execute(sql`select number from presales.opportunity where project_id = ${input.projectId} and id <> ${o.id}`);
    if (taken) throw new Error(`project ${input.projectKey} already belongs to ${numberOf(Number(taken.number))}`);
    await tx.execute(sql`update presales.opportunity set project_id = ${input.projectId}, project_key = ${input.projectKey}, updated_at = now() where id = ${o.id}`);
    const [c] = await tx.execute(sql`select name from presales.client where id = ${o.client_id}`);
    const payload: OpportunityPromoted = {
      opportunityId: o.id as string, number: numberOf(Number(o.number)), projectId: input.projectId, projectKey: input.projectKey, by: actorOf(ctx), client: c.name as string,
      costCentre: (o.cost_centre as string | null) ?? null, estimateDays: o.estimate_days === null ? null : Number(o.estimate_days), ownerName: (o.owner_name as string | null) ?? null,
      leadName: (o.lead_name as string | null) ?? null, valueUsd: { amount: String(o.value_usd), currency: "USD" },
    };
    return { result: { number: input.number, projectKey: input.projectKey }, resourceId: o.id as string, before: { projectId: o.project_id }, after: input, events: [{ name: EVENTS.promoted, payload }] };
  },
});

/**
 * Promote to delivery: delivery creates the project through its contract (its own service, audit
 * and permission check), then presales links it. A retry after a failed link finds the project it
 * made (same key, name and client) and links that instead of failing on the taken key.
 */
export async function promoteToDelivery(viewer: Viewer, raw: unknown, opts: { source?: Source; create?: CreateProject | null } = {}) {
  const create = opts.create === undefined ? deliveryCreateProject() : opts.create;
  if (!can(viewer, "presales:promote")) throw new ForbiddenError("presales:promote", "presales.opportunity");
  const input = promoteInput.parse(raw);
  if (!create) throw new PromotionUnavailableError();
  const { opp, existing } = await withTenant(getRuntime().db, viewer.tenantId, async (tx) => ({ opp: await getOpportunityRef(tx, input.number), existing: await delivery.getProjectRef(tx, input.key) }));
  if (!opp) throw new Error(`no opportunity ${input.number}`);
  if (opp.stage !== "won") throw new Error(`${input.number} isn't won yet; only won opportunities become projects`);
  if (opp.projectId) throw new Error(`${input.number} is already project ${opp.projectKey}`);
  const ours = existing && existing.name === opp.title && existing.client === opp.client;
  if (existing && !ours) throw new Error(`delivery already has a project ${input.key}; choose another key`);
  const ctx = ctxFor(viewer, opts.source);
  const project = existing ?? (await create(ctx, { key: input.key, name: opp.title, client: opp.client, billing: input.billing }));
  return recordPromotion(ctx, { number: input.number, projectId: project.id, projectKey: project.key });
}
