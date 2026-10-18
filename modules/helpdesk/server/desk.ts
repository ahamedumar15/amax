import { sql } from "drizzle-orm";
import { z } from "zod";
import type { Tx } from "@amax/db";
import { defineService, type ServiceContext } from "@amax/core/server";
import { EVENTS, SUPPORT_AGENT, type QueueKey, type TicketResolved } from "../contracts";
import { by, CREATE, inQueue, personOf, READ } from "./read";

const ticketId = z.uuid().describe("The ticket's id, from get_helpdesk or get_ticket");

/** The ticket, locked, when the person works in its queue (HR's only for HR and Admin). */
export async function deskTicket(tx: Tx, ctx: ServiceContext, id: string) {
  const [t] = await tx.execute(sql`select t.*, q.key as queue from helpdesk.ticket t join helpdesk.queue q on q.id = t.queue_id where t.id = ${id} for update of t`);
  if (!t || !inQueue(ctx, t.queue as QueueKey)) throw new Error("no such ticket in your queues");
  return t;
}

const log = (tx: Tx, ctx: ServiceContext, id: string, kind: string, detail: object) =>
  tx.execute(sql`insert into helpdesk.ticket_event (tenant_id, ticket_id, kind, done_by, detail, ticket_closed_at)
    select ${ctx.tenantId}, id, ${kind}, ${by(ctx)}, ${JSON.stringify(detail)}::jsonb, closed_at from helpdesk.ticket where id = ${id}`);

/** Closes a ticket as resolved and stamps its events with the closing time (032 counts seven years from it). */
export async function closeTicket(tx: Tx, ctx: ServiceContext, t: Record<string, unknown>, resolution: string, handledBy: string) {
  await tx.execute(sql`update helpdesk.ticket set status = 'resolved', resolution = ${resolution}, handled_by = ${handledBy}, closed_at = now(), first_response_at = coalesce(first_response_at, now()) where id = ${t.id}`);
  await log(tx, ctx, t.id as string, "resolved", { byAgent: handledBy === SUPPORT_AGENT });
  await tx.execute(sql`update helpdesk.ticket_event set ticket_closed_at = now() where ticket_id = ${t.id}`);
  const payload: TicketResolved = { ticketId: t.id as string, queue: t.queue as QueueKey, byAgent: handledBy === SUPPORT_AGENT };
  return { name: EVENTS.resolved, payload };
}

export const assignTicket = defineService({
  name: "helpdesk.ticket.assign", action: READ, resource: "helpdesk.ticket",
  input: z.object({ ticketId, assigneeUserId: z.uuid().optional().describe("Who handles it; yourself if left out"), waitingOnRequester: z.boolean().default(false) }),
  async run(tx, a, ctx) {
    const t = await deskTicket(tx, ctx, a.ticketId);
    if (t.status === "resolved" || t.status === "closed") throw new Error(`${t.number as string} is already ${t.status as string}`);
    const handler = `user:${a.assigneeUserId ?? personOf(ctx)}`;
    const status = a.waitingOnRequester ? "waiting" : "open";
    await tx.execute(sql`update helpdesk.ticket set handled_by = ${handler}, status = ${status}, first_response_at = coalesce(first_response_at, now()) where id = ${t.id}`);
    await log(tx, ctx, a.ticketId, a.waitingOnRequester ? "waiting" : "assigned", { handler });
    return { result: { id: a.ticketId, number: t.number as string, status }, resourceId: a.ticketId, before: { handledBy: t.handled_by, status: t.status }, after: { handledBy: handler, status } };
  },
});

export const resolveTicket = defineService({
  name: "helpdesk.ticket.resolve", action: READ, resource: "helpdesk.ticket",
  input: z.object({ ticketId, resolution: z.string().trim().min(3).max(500) }),
  async run(tx, a, ctx) {
    const t = await deskTicket(tx, ctx, a.ticketId);
    if (t.needs_verification && !/verif/i.test(a.resolution)) throw new Error("say how you verified the requester's identity before resolving a credential request");
    if (t.status === "resolved" || t.status === "closed") throw new Error(`${t.number as string} is already ${t.status as string}`);
    const event = await closeTicket(tx, ctx, t, a.resolution, `user:${personOf(ctx)}`);
    return { result: { id: a.ticketId, number: t.number as string, status: "resolved" }, resourceId: a.ticketId, before: { status: t.status }, after: { status: "resolved", resolution: a.resolution }, events: [event] };
  },
});

export const rateTicket = defineService({
  name: "helpdesk.ticket.rate", action: CREATE, resource: "helpdesk.rating",
  input: z.object({ ticketId, score: z.number().int().min(1).max(5) }),
  async run(tx, a, ctx) {
    const [t] = await tx.execute(sql`select id, number, status, requester_user_id from helpdesk.ticket where id = ${a.ticketId}`);
    if (!t || t.requester_user_id !== personOf(ctx)) throw new Error("only the requester rates a ticket");
    if (t.status !== "resolved") throw new Error(`${t.number as string} isn't resolved yet`);
    await tx.execute(sql`insert into helpdesk.rating (tenant_id, ticket_id, score) values (${ctx.tenantId}, ${a.ticketId}, ${a.score}) on conflict (ticket_id) do update set score = excluded.score, rated_at = now()`);
    await log(tx, ctx, a.ticketId, "rated", { score: a.score });
    return { result: { id: a.ticketId, score: a.score }, resourceId: a.ticketId, after: { score: a.score } };
  },
});
