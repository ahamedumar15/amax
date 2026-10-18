import { sql } from "drizzle-orm";
import { z } from "zod";
import type { Tx } from "@amax/db";
import { defineSuggestionKind } from "@amax/agents";
import { SuggestionError } from "@amax/agents/server";
import { ACCESS_KIND, CATEGORIES, EVENTS, PRIORITIES, SUPPORT_AGENT, TRIAGE_JOB, TRIAGE_KIND, type AccessApproved } from "./contracts";
import { closeTicket } from "./server/desk";
import { APPROVE, personOf, READ } from "./server/read";

// AC-2: the support agent proposes; people decide. Its triage sets a ticket's category and priority
// (and may name the resource an access request is for). An access suggestion is approved only by
// that resource's owner (scope ownerUserId, helpdesk:access:approve@own) and never by the requester.
export const Triage = z.object({ ticketId: z.uuid(), category: z.enum(CATEGORIES), priority: z.enum(PRIORITIES), resourceKey: z.string().max(60).nullish() });
export const Access = z.object({ ticketId: z.uuid(), resourceId: z.uuid(), resource: z.string().max(120) });
type Before = { category: string; priority: string };

async function open(tx: Tx, ticketId: string) {
  const [t] = await tx.execute(sql`select t.*, q.key as queue from helpdesk.ticket t join helpdesk.queue q on q.id = t.queue_id where t.id = ${ticketId} for update of t`);
  if (!t) throw new SuggestionError("that ticket is gone");
  return t;
}

export const triageKind = defineSuggestionKind<z.infer<typeof Triage>, Before>({
  kind: TRIAGE_KIND, title: "Triage a helpdesk ticket", permission: READ, proposed: Triage, jobs: [TRIAGE_JOB],
  async apply(tx, _ctx, p) {
    const t = await open(tx, p.ticketId);
    await tx.execute(sql`update helpdesk.ticket set category = ${p.category}, priority = ${p.priority}, triaged_at = now() where id = ${p.ticketId}`);
    return { applied: { category: t.category as string, priority: t.priority as string }, action: "helpdesk.ticket.triage", resource: "helpdesk.ticket", resourceId: p.ticketId, after: { category: p.category, priority: p.priority } };
  },
  async undo(tx, _ctx, p, a) {
    await tx.execute(sql`update helpdesk.ticket set category = ${a.category}, priority = ${a.priority} where id = ${p.ticketId}`);
    return { applied: null, action: "helpdesk.ticket.triage.undo", resource: "helpdesk.ticket", resourceId: p.ticketId, after: a };
  },
});

export const accessKind = defineSuggestionKind<z.infer<typeof Access>, { resolved: boolean }>({
  kind: ACCESS_KIND, title: "Approve an access request", permission: APPROVE, proposed: Access, sensitive: true, jobs: [TRIAGE_JOB],
  async apply(tx, ctx, p) {
    const t = await open(tx, p.ticketId);
    if (t.status === "resolved" || t.status === "closed") throw new SuggestionError(`${t.number as string} is already ${t.status as string}`);
    const approver = personOf(ctx)!;
    const [me] = await tx.execute(sql`select name from auth.user where id = ${approver}`);
    const event = await closeTicket(tx, ctx, t, `Granted by support agent after ${(me?.name as string | undefined) ?? "the owner"} approved`, SUPPORT_AGENT);
    const approved: AccessApproved = { ticketId: p.ticketId, resourceId: p.resourceId, approvedBy: approver };
    return { applied: { resolved: true }, action: "helpdesk.access.approve", resource: "helpdesk.ticket", resourceId: p.ticketId, before: { status: t.status }, after: { status: "resolved", resource: p.resource },
      events: [event, { name: EVENTS.accessApproved, payload: approved }] };
  },
  async undo(tx, _ctx, p) {
    await tx.execute(sql`update helpdesk.ticket set status = 'open', resolution = null, closed_at = null where id = ${p.ticketId} and status = 'resolved'`);
    await tx.execute(sql`update helpdesk.ticket_event set ticket_closed_at = null where ticket_id = ${p.ticketId}`);
    return { applied: null, action: "helpdesk.access.reopen", resource: "helpdesk.ticket", resourceId: p.ticketId, after: { status: "open" } };
  },
});

export const supportKinds = [triageKind, accessKind];
