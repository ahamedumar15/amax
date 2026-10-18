import { sql } from "drizzle-orm";
import { z } from "zod";
import type { Tx } from "@amax/db";
import { defineService, type ServiceContext } from "@amax/core/server";
import { CATEGORIES, CHANNELS, EVENTS, PRIORITIES, QUEUES, type Channel, type QueueKey, type TicketCreated } from "../contracts";
import { isCredentialRequest, plainText, safeLink, VERIFY_NOTE } from "./identity";
import { by, CREATE, inQueue, personOf } from "./read";

export const TicketInput = z.object({
  queue: z.enum(QUEUES).default("it"),
  title: z.string().trim().min(3).max(200),
  description: z.string().max(4000).optional(),
  category: z.enum(CATEGORIES).optional(),
  priority: z.enum(PRIORITIES).default("normal"),
  channel: z.enum(CHANNELS).default("chat").describe("chat, or teams or email when it comes from an inbox find"),
  sourceLink: z.string().max(500).optional().describe("The link to the Teams or email message it came from"),
  requesterUserId: z.uuid().optional().describe("Who it is for; yourself unless you work in that queue"),
});
export type TicketInput = z.input<typeof TicketInput>;
type Write = { ctx: ServiceContext; queue: QueueKey; channel: Channel; requester: string | null; title: string; body: string | null; category?: string; priority: string; sourceLink: string | null; note?: string | null; origin?: string; originRef?: string; openedAt?: string };

/** Writes a ticket in the caller's transaction (the service below, the onboarding handler and fixtures). */
export async function writeTicket(tx: Tx, w: Write) {
  const verify = isCredentialRequest(w.title, w.body);
  const queue = verify ? "it" : w.queue;
  const [q] = await tx.execute(sql`update helpdesk.queue set next_no = next_no + 1 where key = ${queue} returning id, prefix, next_no - 1 as no`);
  if (!q) throw new Error(`no ${queue} queue`);
  // AC-2: only a requester raising their own ticket in chat or Teams is signed in; email never is.
  const signedIn = w.channel !== "email" && !!w.requester && w.requester === personOf(w.ctx);
  const [t] = await tx.execute(sql`insert into helpdesk.ticket (tenant_id, queue_id, number, title, body, category, priority, channel, source_link, requester_user_id, signed_in,
      needs_verification, note, created_by, origin, origin_ref, opened_at, triaged_at)
    values (${w.ctx.tenantId}, ${q.id}, ${`${q.prefix}-${q.no}`}, ${w.title}, ${w.body}, ${w.category ?? "Other"}, ${w.priority}, ${w.channel}, ${w.sourceLink}, ${w.requester}, ${signedIn},
      ${verify}, ${verify ? VERIFY_NOTE : (w.note ?? null)}, ${by(w.ctx)}, ${w.origin ?? null}, ${w.originRef ?? null}, coalesce(${w.openedAt ?? null}::timestamptz, now()), ${verify || w.category ? sql`now()` : null})
    on conflict (tenant_id, origin, origin_ref) do nothing returning id, number`);
  if (!t) return null;
  await tx.execute(sql`insert into helpdesk.ticket_event (tenant_id, ticket_id, kind, done_by, detail) values (${w.ctx.tenantId}, ${t.id}, 'opened', ${by(w.ctx)}, ${JSON.stringify({ channel: w.channel, verify })}::jsonb)`);
  const payload: TicketCreated = { ticketId: t.id as string, queue, channel: w.channel };
  return { id: t.id as string, number: t.number as string, queue, needsVerification: verify, signedIn, payload };
}

export const createTicket = defineService({
  name: "helpdesk.ticket.create", action: CREATE, resource: "helpdesk.ticket", input: TicketInput,
  async run(tx, a, ctx) {
    const me = personOf(ctx);
    const requester = a.requesterUserId ?? me;
    if (requester !== me && !inQueue(ctx, a.queue)) throw new Error("you can raise a ticket only for yourself");
    const t = await writeTicket(tx, { ctx, queue: a.queue, channel: a.channel, requester, title: plainText(a.title), body: a.description ? plainText(a.description) : null, category: a.category,
      priority: a.priority, sourceLink: safeLink(a.sourceLink) });
    if (!t) throw new Error("that ticket already exists");
    const { payload, ...result } = t;
    return { result, resourceId: t.id, after: { number: t.number, queue: t.queue, channel: a.channel, needsVerification: t.needsVerification }, events: [{ name: EVENTS.created, payload }] };
  },
});
