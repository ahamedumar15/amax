import { sql } from "drizzle-orm";
import { z } from "zod";
import type { Tx } from "@amax/db";
import { claimKey, defineService } from "@amax/core/server";
import { EVENTS, numberOf, type OpportunityPromoted } from "../contracts";
import { actorOf, lockOpportunity, NUMBER } from "./common";

/** How long a promotion attempt holds its claim before a retry may resume or replace it. */
export const CLAIM_SECONDS = 120;

/**
 * The idempotency key delivery's create runs under. A claim series is one key and one billing for
 * one opportunity: resumes keep it, so they get back the project the series made; a release or a
 * takeover ends it.
 */
export const createKey = (series: string) => `presales.promote:${series}`;

/**
 * Ends a series inside this transaction by cancelling its create key (core idempotency): a create
 * still in flight under it waits for this, then fails without making a project. Returns false when
 * the series already made a project, which then stays the opportunity's.
 */
async function endSeries(tx: Tx, tenantId: string, series: string) {
  const prior = await claimKey(tx, tenantId, createKey(series), { cancelled: true });
  return !prior || "cancelled" in prior;
}

/**
 * Claims a won opportunity for promotion under its row lock, before delivery is asked for anything.
 * While a claim is fresh every other attempt is refused. A stale claim is resumed with the same key
 * and billing; it gives way to other inputs only if its series made nothing (ended here, so a slow
 * create from it can't land later).
 */
export const claimPromotion = defineService({
  name: "presales.opportunity.promote.claim",
  action: "presales:promote",
  resource: "presales.opportunity",
  input: z.object({ number: z.string().regex(NUMBER), key: z.string(), billing: z.string() }),
  async run(tx, input, ctx) {
    const o = await lockOpportunity(tx, input.number);
    if (o.stage !== "won") throw new Error(`${input.number} isn't won yet; only won opportunities become projects`);
    if (o.project_id) throw new Error(`${input.number} is already project ${o.project_key}`);
    const same = o.claim_key === input.key && o.claim_billing === input.billing;
    if (o.claim_key) {
      const [{ fresh }] = await tx.execute(sql`select ${o.claimed_at}::timestamptz > now() - make_interval(secs => ${CLAIM_SECONDS}) as fresh`);
      if (fresh) throw new Error(`${input.number} is being promoted as ${o.claim_key} right now; try again in a couple of minutes`);
      if (!same && !(await endSeries(tx, ctx.tenantId, o.claim_series as string))) throw new Error(`${input.number} was promoted as ${o.claim_key} (${o.claim_billing}); promote it with those to finish`);
    }
    const [c] = await tx.execute(sql`update presales.opportunity set claim_key = ${input.key}, claim_billing = ${input.billing}, claim_token = gen_random_uuid(), claimed_at = now(),
        claim_series = ${same ? sql`claim_series` : sql`gen_random_uuid()`} where id = ${o.id} returning claim_token, claim_series`);
    return { result: { token: c.claim_token as string, series: c.claim_series as string, resumed: same }, resourceId: o.id as string, before: { claim: o.claim_key }, after: { claim: input.key, billing: input.billing } };
  },
});

/**
 * Gives up this attempt's claim when its series made nothing, deciding that in the same transaction
 * as the release. `force` also releases after a project was made, for a link refused for good.
 */
export const releasePromotion = defineService({
  name: "presales.opportunity.promote.release",
  action: "presales:promote",
  resource: "presales.opportunity",
  input: z.object({ number: z.string().regex(NUMBER), token: z.string().uuid(), force: z.boolean().default(false) }),
  async run(tx, input, ctx) {
    const o = await lockOpportunity(tx, input.number);
    if (o.claim_token !== input.token) return { result: { released: false }, resourceId: o.id as string };
    if (!(await endSeries(tx, ctx.tenantId, o.claim_series as string)) && !input.force) return { result: { released: false }, resourceId: o.id as string };
    await tx.execute(sql`update presales.opportunity set claim_key = null, claim_billing = null, claim_token = null, claim_series = null, claimed_at = null where id = ${o.id}`);
    return { result: { released: true }, resourceId: o.id as string, after: { released: true, force: input.force } };
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
    if (o.project_id === input.projectId) return { result: { number: input.number, projectKey: input.projectKey }, resourceId: o.id as string };
    if (o.claim_token !== input.token || o.claim_key !== input.projectKey) throw new Error(`${input.number} is no longer claimed by this promotion; promote it again with ${input.projectKey}`);
    // The unique index on project_id refuses a project another opportunity already holds.
    await tx.execute(sql`update presales.opportunity set project_id = ${input.projectId}, project_key = ${input.projectKey}, claim_key = null, claim_billing = null, claim_token = null, claim_series = null, claimed_at = null, updated_at = now() where id = ${o.id}`);
    const [c] = await tx.execute(sql`select name from presales.client where id = ${o.client_id}`);
    const payload: OpportunityPromoted = {
      opportunityId: o.id as string, number: numberOf(Number(o.number)), projectId: input.projectId, projectKey: input.projectKey, by: actorOf(ctx), client: c.name as string,
      costCentre: (o.cost_centre as string | null) ?? null, estimateDays: o.estimate_days === null ? null : Number(o.estimate_days), ownerName: (o.owner_name as string | null) ?? null,
      leadName: (o.lead_name as string | null) ?? null, valueUsd: { amount: String(o.value_usd), currency: "USD" },
    };
    return { result: { number: input.number, projectKey: input.projectKey }, resourceId: o.id as string, before: { projectId: null }, after: { projectId: input.projectId, projectKey: input.projectKey }, events: [{ name: EVENTS.promoted, payload }] };
  },
});
