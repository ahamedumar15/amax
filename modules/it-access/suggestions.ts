import { sql } from "drizzle-orm";
import { z } from "zod";
import type { Tx } from "@amax/db";
import type { ServiceContext } from "@amax/core/server";
import { defineSuggestionKind } from "@amax/agents";
import { SuggestionError } from "@amax/agents/server";
import { detailFor, queueChange, undoChanges } from "./server/changes";
import { actorOf, APPROVE, today } from "./server/read";

// AC-2: every grant, revoke and seat removal is a 006 suggestion that IT approves. They are
// `sensitive` (the approver can't be the person the agent acted for) and undoable: accepting queues
// the change for its day; undo cancels it, or queues the inverse once it was made.
const Grant = z.object({ accountId: z.uuid(), productId: z.uuid(), account: z.string(), product: z.string() });
const Revoke = z.object({ accountId: z.uuid(), account: z.string(), lastDay: z.iso.date() });
const Remove = z.object({ productId: z.uuid(), product: z.string(), seatIds: z.array(z.uuid()).min(1).max(200) });
type Applied = { changeIds: string[] };

async function account(tx: Tx, id: string) {
  const [a] = await tx.execute(sql`select * from it_access.account where id = ${id}`);
  if (!a) throw new SuggestionError("that account is gone");
  return a;
}

const undo = async (tx: Tx, ctx: ServiceContext, a: Applied, what: string) => {
  const events = await undoChanges(tx, ctx.tenantId, a.changeIds, actorOf(ctx), today());
  return { applied: null, action: `it-access.${what}.undo`, resource: "it_access.change", resourceId: a.changeIds[0] ?? null, after: { undone: a.changeIds, inverse: events.length }, events };
};

export const grantKind = defineSuggestionKind<z.infer<typeof Grant>, Applied>({
  kind: "it-access.grant", title: "Give someone a licence", permission: APPROVE, proposed: Grant, sensitive: true,
  async apply(tx, ctx, p) {
    const a = await account(tx, p.accountId);
    if (a.status !== "active") throw new SuggestionError(`${p.account} has left; nothing is granted to a leaver`);
    const [held] = await tx.execute(sql`select 1 from it_access.seat where account_id = ${p.accountId} and product_id = ${p.productId} and removed_on is null`);
    if (held) throw new SuggestionError(`${p.account} already has ${p.product}`);
    const q = await queueChange(tx, ctx.tenantId, { accountId: p.accountId, productId: p.productId, action: "grant", effectiveOn: today(), by: actorOf(ctx), detail: await detailFor(tx, p, []) });
    return { applied: { changeIds: [q.id] }, action: "it-access.grant", resource: "it_access.change", resourceId: q.id, after: { account: p.account, product: p.product }, events: [q.event] };
  },
  undo: (tx, ctx, _p, a) => undo(tx, ctx, a, "grant"),
});

export const revokeKind = defineSuggestionKind<z.infer<typeof Revoke>, Applied>({
  kind: "it-access.revoke", title: "Revoke someone's access", permission: APPROVE, proposed: Revoke, sensitive: true,
  async apply(tx, ctx, p) {
    await account(tx, p.accountId);
    const seats = (await tx.execute(sql`select id from it_access.seat where account_id = ${p.accountId} and removed_on is null`)).map((s) => s.id as string);
    const on = p.lastDay < today() ? today() : p.lastDay;
    const q = await queueChange(tx, ctx.tenantId, { accountId: p.accountId, productId: null, action: "revoke", effectiveOn: on, by: actorOf(ctx), detail: await detailFor(tx, { accountId: p.accountId, productId: null }, seats) });
    return { applied: { changeIds: [q.id] }, action: "it-access.revoke", resource: "it_access.change", resourceId: q.id, after: { account: p.account, effectiveOn: on, seats: seats.length }, events: [q.event] };
  },
  undo: (tx, ctx, _p, a) => undo(tx, ctx, a, "revoke"),
});

export const removeSeatsKind = defineSuggestionKind<z.infer<typeof Remove>, Applied>({
  kind: "it-access.remove-seats", title: "Remove unused licence seats", permission: APPROVE, proposed: Remove, sensitive: true,
  async apply(tx, ctx, p) {
    const seats = await tx.execute(sql`select id, account_id from it_access.seat where id = any(${`{${p.seatIds.join(",")}}`}::uuid[]) and product_id = ${p.productId} and removed_on is null`);
    if (!seats.length) throw new SuggestionError(`those ${p.product} seats are already gone`);
    const ids: string[] = [], events = [];
    for (const s of seats) {
      const t = { accountId: s.account_id as string, productId: p.productId };
      const q = await queueChange(tx, ctx.tenantId, { ...t, action: "remove-seat", effectiveOn: today(), by: actorOf(ctx), detail: await detailFor(tx, t, [s.id as string]) });
      ids.push(q.id);
      events.push(q.event);
    }
    return { applied: { changeIds: ids }, action: "it-access.remove-seats", resource: "it_access.change", resourceId: ids[0], after: { product: p.product, seats: ids.length }, events };
  },
  undo: (tx, ctx, _p, a) => undo(tx, ctx, a, "remove-seats"),
});

export const accessKinds = [grantKind, revokeKind, removeSeatsKind];
