import { sql } from "drizzle-orm";
import type { Tx } from "@amax/db";
import { SUPPORT_AGENT, type Category, type Channel, type Priority, type QueueKey, type Status } from "../contracts";
import { iso } from "./read";
import { namesOf, shortName } from "./names";

type Row = Record<string, unknown>;
/** AC-1: the SLA a ticket is on now: its response target until someone responds, then its resolution target. Paused while it waits on the requester. */
export type Sla = { stage: "response" | "resolution" | "paused" | "done"; dueAt: string | null; leftMinutes: number | null; near: boolean; breached: boolean };
export type Handler = { kind: "agent" | "person"; name: string } | null;
export type TicketRow = {
  id: string; number: string; queue: QueueKey; title: string; body: string | null; category: Category; priority: Priority; status: Status; channel: Channel; sourceLink: string | null;
  requesterUserId: string | null; requester: string | null; signedIn: boolean; needsVerification: boolean; note: string | null; resolution: string | null; handler: Handler;
  openedAt: string; firstResponseAt: string | null; closedAt: string | null; suggestionId: string | null; sla: Sla; rating: number | null;
};

export const TICKET = sql`select t.*, q.key as queue, s.response_minutes, s.resolution_minutes, r.score from helpdesk.ticket t join helpdesk.queue q on q.id = t.queue_id
  left join helpdesk.sla s on s.queue_id = t.queue_id and s.priority = t.priority left join helpdesk.rating r on r.ticket_id = t.id`;
/** A ticket is near its breach once a quarter of its target is left. */
export const NEAR = 0.25;

export function slaOf(r: Row, now: Date): Sla {
  if (r.status === "resolved" || r.status === "closed") return { stage: "done", dueAt: null, leftMinutes: null, near: false, breached: false };
  if (r.status === "waiting") return { stage: "paused", dueAt: null, leftMinutes: null, near: false, breached: false };
  const stage = r.first_response_at ? "resolution" : "response";
  const target = Number(stage === "response" ? r.response_minutes : r.resolution_minutes);
  if (!target) return { stage, dueAt: null, leftMinutes: null, near: false, breached: false };
  const due = new Date(Date.parse(iso(r.opened_at)!) + target * 60_000);
  const left = Math.floor((due.getTime() - now.getTime()) / 60_000);
  return { stage, dueAt: due.toISOString(), leftMinutes: left, near: left >= 0 && left <= target * NEAR, breached: left < 0 };
}

const handlerOf = (h: unknown, names: Map<string, string>): Handler =>
  h === SUPPORT_AGENT ? { kind: "agent", name: "Support agent" } : typeof h === "string" && h.startsWith("user:") ? { kind: "person", name: shortName(names.get(h.slice(5)) ?? "Someone") } : null;

/** Ticket rows with requester and handler names (hr's, else the user's) and their SLA as of `now`. */
export async function ticketRows(tx: Tx, tenantId: string, rows: Row[], now: Date): Promise<TicketRow[]> {
  const ids = rows.flatMap((r) => [r.requester_user_id, typeof r.handled_by === "string" && r.handled_by.startsWith("user:") ? r.handled_by.slice(5) : null]).filter((x): x is string => typeof x === "string");
  const names = await namesOf(tx, tenantId, ids);
  return rows.map((r) => ({
    id: r.id as string, number: r.number as string, queue: r.queue as QueueKey, title: r.title as string, body: (r.body as string | null) ?? null, category: r.category as Category,
    priority: r.priority as Priority, status: r.status as Status, channel: r.channel as Channel, sourceLink: (r.source_link as string | null) ?? null,
    requesterUserId: (r.requester_user_id as string | null) ?? null, requester: r.requester_user_id ? (names.get(r.requester_user_id as string) ?? null) : null,
    signedIn: r.signed_in === true, needsVerification: r.needs_verification === true, note: (r.note as string | null) ?? null, resolution: (r.resolution as string | null) ?? null,
    handler: handlerOf(r.handled_by, names), openedAt: iso(r.opened_at)!, firstResponseAt: iso(r.first_response_at), closedAt: iso(r.closed_at),
    suggestionId: (r.suggestion_id as string | null) ?? null, sla: slaOf(r, now), rating: r.score === null || r.score === undefined ? null : Number(r.score),
  }));
}
