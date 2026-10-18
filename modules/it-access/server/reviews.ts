import { sql } from "drizzle-orm";
import { z } from "zod";
import type { Tx } from "@amax/db";
import { defineService } from "@amax/core/server";
import { EVENTS, type ReviewRecorded } from "../contracts";
import { actorOf, day, mayAct, REVIEW, today } from "./read";

const accountId = z.uuid().describe("The account's id, from list_access or get_account");

export async function lockAccount(tx: Tx, id: string) {
  const [a] = await tx.execute(sql`select * from it_access.account where id = ${id} for update`);
  if (!a) throw new Error("no such account");
  return a;
}

// An access review: a person looked at what this account holds and kept it. Changes go through the
// grant, revoke and remove-seat suggestions instead, so a review never changes access by itself.
export const recordReview = defineService({
  scoped: true,
  name: "it-access.review.record",
  action: REVIEW,
  resource: "it_access.account",
  input: z.object({ accountId }),
  async run(tx, { accountId }, ctx) {
    mayAct(ctx, REVIEW);
    const a = await lockAccount(tx, accountId);
    const by = actorOf(ctx), on = today();
    await tx.execute(sql`update it_access.account set reviewed_on = ${on}, reviewed_by = ${by} where id = ${accountId}`);
    const payload: ReviewRecorded = { accountId, personId: (a.person_id as string | null) ?? null, reviewedOn: on, by };
    return { result: { accountId, reviewedOn: on }, resourceId: accountId, before: { reviewedOn: day(a.reviewed_on) }, after: { reviewedOn: on }, events: [{ name: EVENTS.reviewRecorded, payload }] };
  },
});

// A contractor's access ends on its expiry; a person extends it, up to a year at a time.
export const extendAccess = defineService({
  scoped: true,
  name: "it-access.account.extend",
  action: REVIEW,
  resource: "it_access.account",
  input: z.object({ accountId, until: z.iso.date().describe("The new last day, YYYY-MM-DD") }),
  async run(tx, { accountId, until }, ctx) {
    mayAct(ctx, REVIEW);
    const a = await lockAccount(tx, accountId);
    if (a.kind !== "contractor" || a.status !== "active") throw new Error("only an active contractor's access has an expiry to extend");
    const limit = new Date(Date.now() + 366 * 86_400_000).toISOString().slice(0, 10);
    if (until <= today() || until > limit) throw new Error("the new expiry must be after today and within a year");
    await tx.execute(sql`update it_access.account set expires_on = ${until}, reviewed_on = ${today()}, reviewed_by = ${actorOf(ctx)} where id = ${accountId}`);
    return { result: { accountId, expiresOn: until }, resourceId: accountId, before: { expiresOn: day(a.expires_on) }, after: { expiresOn: until } };
  },
});
