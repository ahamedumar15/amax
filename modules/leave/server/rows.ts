import { sql } from "drizzle-orm";
import type { Tx } from "@amax/db";
import type { ServiceContext } from "@amax/core/server";
import type { HalfDay, LeaveType, RequestStatus } from "../contracts";
import { asDay } from "./days";

export type RequestRow = Record<string, unknown> & { id: string; person_id: string; user_id: string | null; legal_entity_id: string; status: RequestStatus };

export const by = (ctx: ServiceContext) => (ctx.onBehalfOf ? `${ctx.actor.id} for ${ctx.onBehalfOf}` : ctx.actor.id);

export async function loadRequest(tx: Tx, id: string): Promise<RequestRow> {
  const [row] = await tx.execute(sql`select * from leave.request where id = ${id} for update`);
  if (!row) throw new Error("no such leave request");
  return row as RequestRow;
}

/** The fields every leave event carries. */
export const leaveOf = (r: RequestRow) => ({
  requestId: r.id, personId: r.person_id, userId: r.user_id ?? null, legalEntityId: r.legal_entity_id, type: r.type as LeaveType,
  startsOn: asDay(r.starts_on), endsOn: asDay(r.ends_on), halfDay: (r.half_day as HalfDay | null) ?? null, days: Number(r.days),
});

const short = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

/** "Oct 27 – Oct 30", "Nov 2", "Nov 2 (morning)". */
export function dateSpan(from: string, to: string, half: HalfDay | null = null) {
  const span = from === to ? short(from) : `${short(from)} – ${short(to)}`;
  return half ? `${span} (${half === "am" ? "morning" : "afternoon"})` : span;
}

export async function paidType(tx: Tx, legalEntityId: string, type: string) {
  const [p] = await tx.execute(sql`select paid from leave.policy where legal_entity_id = ${legalEntityId} and type = ${type}`);
  return p ? Boolean(p.paid) : true;
}
