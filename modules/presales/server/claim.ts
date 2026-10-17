import { sql } from "drizzle-orm";
import { z } from "zod";
import { defineService } from "@amax/core/server";
import { EVENTS, numberOf, type OpportunityPromoted } from "../contracts";
import { actorOf, lockOpportunity, NUMBER } from "./common";

/** How long a promotion attempt holds its claim before a retry with the same key may resume it. */
export const CLAIM_SECONDS = 120;

/** The idempotency key delivery's create runs under: one opportunity, one key, at most one project. */
export const createKey = (opportunityId: string, projectKey: string) => `presales.promote:${opportunityId}:${projectKey}`;

/**
 * Claims a won opportunity for promotion under its row lock, before delivery is asked for anything.
 * While a claim is fresh every other attempt is refused. A claim stays bound to its key until the
 * attempt fails and releases it, so a stale claim is only ever resumed with the same key: delivery's
 * create runs under createKey, so a resumed attempt gets back the project the first one made.
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
      if (o.claim_key !== input.key) throw new Error(`${input.number} was being promoted as ${o.claim_key}; promote it with that key to finish`);
    }
    const [c] = await tx.execute(sql`update presales.opportunity set claim_key = ${input.key}, claim_token = gen_random_uuid(), claimed_at = now() where id = ${o.id} returning claim_token`);
    return { result: { token: c.claim_token as string, opportunityId: o.id as string, resumed: Boolean(o.claim_key) }, resourceId: o.id as string, before: { claim: o.claim_key }, after: { claim: input.key } };
  },
});

/** Gives up a claim this attempt still holds, once delivery has certainly made nothing under it. */
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

/** Links the won opportunity to the project delivery made under this attempt's claim, and says so on the outbox. */
export const recordPromotion = defineService({
  name: "presales.opportunity.promote",
  action: "presales:promote",
  resource: "presales.opportunity",
  input: z.object({ number: z.string().regex(NUMBER), token: z.string().uuid(), projectId: z.string().uuid(), projectKey: z.string() }),
  async run(tx, input, ctx) {
    const o = await lockOpportunity(tx, input.number);
    if (o.claim_token !== input.token || o.claim_key !== input.projectKey) throw new Error(`${input.number} is no longer claimed by this promotion; promote it again with ${input.projectKey}`);
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
