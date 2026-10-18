import { sql } from "drizzle-orm";
import type { Viewer } from "@amax/auth";
import { withTenant, type Tx } from "@amax/db";
import { getRuntime } from "@amax/core/server";
import type { QueueKey } from "../contracts";
import { clockOf, queuesOf, read } from "./read";
import { ticketRows, TICKET } from "./rows";
import { statsOf } from "./stats";

const monthOf = (now: Date, back: number) => new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - back, 1)).toLocaleString("en-US", { month: "long", timeZone: "UTC" });

/** The queue table: open tickets, and those closed in the last day, newest first. */
export const SHOWN = 8;

async function queuesFor(v: Viewer, tx: Tx) {
  const keys = queuesOf(v);
  const rows = await tx.execute(sql`select id, key, name from helpdesk.queue where key = any(${`{${keys.join(",") || "none"}}`}::text[]) order by array_position(array['it', 'hr', 'facilities'], key)`);
  return rows.map((r) => ({ id: r.id as string, key: r.key as QueueKey, name: r.name as string }));
}

/** The whole screen for one queue: the viewer's queues (HR's only for HR and Admin), tiles and charts across them, and the queue's tickets. */
export const helpdeskView = (v: Viewer, queue?: string) => read(v, async (tx) => {
  const now = await clockOf(tx);
  const queues = await queuesFor(v, tx);
  const current = queues.find((q) => q.key === queue) ?? queues[0] ?? null;
  const ids = queues.map((q) => q.id);
  const open = await ticketRows(tx, v.tenantId, await tx.execute(sql`${TICKET} where t.queue_id = any(${`{${ids.join(",")}}`}::uuid[]) and t.status in ('open', 'waiting')`), now);
  const rows = current ? await ticketRows(tx, v.tenantId, await tx.execute(sql`${TICKET} where t.queue_id = ${current.id}
    and (t.status in ('open', 'waiting') or t.closed_at > ${now.toISOString()}::timestamptz - interval '1 day') order by t.opened_at desc, t.number desc`), now) : [];
  const sla = await tx.execute(sql`select q.key as queue, s.priority, s.response_minutes, s.resolution_minutes from helpdesk.sla s join helpdesk.queue q on q.id = s.queue_id
    where s.queue_id = any(${`{${ids.join(",")}}`}::uuid[]) order by q.key, array_position(array['urgent', 'high', 'normal', 'low'], s.priority)`);
  const resources = await tx.execute(sql`select r.id, r.key, r.name, u.name as owner from helpdesk.access_resource r left join auth.user u on u.id = r.owner_user_id order by r.name`);
  return {
    now: now.toISOString(), month: monthOf(now, 0), lastMonth: monthOf(now, 1), queues, queue: current, tickets: rows, nearBreach: open.filter((t) => t.sla.near).length, breached: open.filter((t) => t.sla.breached).length,
    stats: await statsOf(tx, ids, now),
    slas: sla.map((s) => ({ queue: s.queue as QueueKey, priority: s.priority as string, responseMinutes: Number(s.response_minutes), resolutionMinutes: Number(s.resolution_minutes) })),
    resources: resources.map((r) => ({ id: r.id as string, key: r.key as string, name: r.name as string, owner: (r.owner as string | null) ?? null })),
  };
});
export type HelpdeskView = Awaited<ReturnType<typeof helpdeskView>>;

/** One ticket for someone who works in its queue, or for its requester. Email text is plain text. */
export const getTicket = (v: Viewer, ticketId: string) => withTenant(getRuntime().db, v.tenantId, async (tx) => {
  const [r] = await tx.execute(sql`${TICKET} where t.id = ${ticketId}`);
  if (!r || !(queuesOf(v).includes(r.queue as QueueKey) || r.requester_user_id === v.userId)) return null;
  const [t] = await ticketRows(tx, v.tenantId, [r], await clockOf(tx));
  const events = await tx.execute(sql`select kind, done_by, detail, at from helpdesk.ticket_event where ticket_id = ${ticketId} order by at`);
  return { ...t, events: events.map((e) => ({ kind: e.kind as string, by: e.done_by as string, detail: e.detail, at: new Date(e.at as string).toISOString() })) };
});
