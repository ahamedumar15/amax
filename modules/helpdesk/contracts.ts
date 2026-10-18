// The only import surface for other modules (docs/module-standard.md). Counts per queue only: no
// ticket text, requester or HR detail leaves this module through the contract.
import { sql } from "drizzle-orm";
import type { Tx } from "@amax/db";

export const QUEUES = ["it", "hr", "facilities"] as const;
export type QueueKey = (typeof QUEUES)[number];
export const PRIORITIES = ["low", "normal", "high", "urgent"] as const;
export type Priority = (typeof PRIORITIES)[number];
export const CHANNELS = ["chat", "teams", "email"] as const;
export type Channel = (typeof CHANNELS)[number];
export const CATEGORIES = ["Access", "Hardware", "Network", "Software", "HR letters", "Payroll", "Facilities", "Other"] as const;
export type Category = (typeof CATEGORIES)[number];
export const STATUSES = ["open", "waiting", "resolved", "closed"] as const;
export type Status = (typeof STATUSES)[number];

/** The support agent's 006 kinds: its triage (category and priority) and an access request the resource owner approves. */
export const TRIAGE_KIND = "helpdesk.triage";
export const ACCESS_KIND = "helpdesk.access";
export const SUPPORT_AGENT = "agent:helpdesk.support";
export const TRIAGE_JOB = "helpdesk.triage";

export const EVENTS = { created: "helpdesk.ticket.created", resolved: "helpdesk.ticket.resolved", accessApproved: "helpdesk.access.approved" } as const;
export type TicketCreated = { ticketId: string; queue: QueueKey; channel: Channel };
export type TicketResolved = { ticketId: string; queue: QueueKey; byAgent: boolean };
export type AccessApproved = { ticketId: string; resourceId: string; approvedBy: string };

export type QueueCount = { queue: QueueKey; open: number; waiting: number };

/** Open and waiting tickets per queue, for another screen's glance (Insights): counts, never tickets. */
export async function queueCounts(tx: Tx): Promise<QueueCount[]> {
  const rows = await tx.execute(sql`select q.key, count(t.id) filter (where t.status in ('open', 'waiting'))::int as open, count(t.id) filter (where t.status = 'waiting')::int as waiting
    from helpdesk.queue q left join helpdesk.ticket t on t.queue_id = q.id group by q.key order by array_position(${`{${QUEUES.join(",")}}`}::text[], q.key)`);
  return rows.map((r) => ({ queue: r.key as QueueKey, open: Number(r.open), waiting: Number(r.waiting) }));
}
