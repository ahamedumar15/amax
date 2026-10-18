import { sql } from "drizzle-orm";
import { z } from "zod";
import type { Tx } from "@amax/db";
import { assertCan, viewerOf } from "@amax/auth";
import { defineService } from "@amax/core/server";
import { balancesFor, EVENTS, LEAVE_SENSITIVE, LEAVE_TYPES, type LeaveRequested } from "../contracts";
import { clashesFor, clashLabel } from "./clash";
import { countryOf, holidaysIn, realDay, workingDays } from "./days";
import { personFor } from "./people";
import { by, dateSpan, leaveOf, type RequestRow } from "./rows";

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "give the date as YYYY-MM-DD");
const input = z.object({
  type: z.enum(LEAVE_TYPES),
  startsOn: day,
  endsOn: day.optional(),
  halfDay: z.enum(["am", "pm"]).optional(),
  note: z.string().trim().max(500).optional(),
  medicalReason: z.string().trim().max(500).optional(),
  certificateRef: z.string().trim().max(200).optional(),
  person: z.string().optional(),
});
type Input = z.infer<typeof input>;

async function daysOf(tx: Tx, a: Input, legalEntityId: string, halfDays: boolean) {
  const from = realDay(a.startsOn), to = realDay(a.endsOn ?? a.startsOn);
  if (to < from) throw new Error("the leave ends before it starts");
  if (a.halfDay && (from !== to || !halfDays)) throw new Error(from !== to ? "a half day is a single day; leave out endsOn" : `${a.type} leave is taken in whole days`);
  const holidays = new Set((await holidaysIn(tx, await countryOf(tx, legalEntityId), from, to)).map((h) => h.on));
  const work = workingDays(from, to, holidays);
  if (!work.length) throw new Error(`${dateSpan(from, to)} has no working days (weekends and holidays don't count)`);
  return { from, to, days: a.halfDay ? 0.5 : work.length };
}

export const requestLeave = defineService({
  scoped: true, name: "leave.request.create", action: "leave:request", resource: "leave.request", input, sensitive: LEAVE_SENSITIVE,
  async run(tx, a, ctx) {
    const p = await personFor(tx, ctx, a.person);
    const v = viewerOf(ctx);
    if (v) assertCan(v, "leave:request", { ownerUserId: p.userId, legalEntityId: p.legalEntityId });
    const [policy] = await tx.execute(sql`select * from leave.policy where legal_entity_id = ${p.legalEntityId} and type = ${a.type}`);
    if (!policy) throw new Error(`${p.name}'s entity has no ${a.type} leave in its country pack`);
    if ((a.medicalReason || a.certificateRef) && !["medical", "personal"].includes(a.type)) throw new Error("a medical reason or certificate goes only with medical or personal leave");
    const { from, to, days } = await daysOf(tx, a, p.legalEntityId, Boolean(policy.half_days));
    const [overlap] = await tx.execute(sql`select starts_on, ends_on from leave.request where person_id = ${p.id} and status in ('pending', 'approved') and starts_on <= ${to} and ends_on >= ${from} limit 1`);
    if (overlap) throw new Error(`${p.name} already has leave booked or requested in ${dateSpan(from, to)}`);
    if (policy.paid) {
      const left = (await balancesFor(tx, ctx, p.id, Number(from.slice(0, 4)))).find((b) => b.type === a.type)?.left ?? 0;
      if (left < days) throw new Error(`${p.name} has ${left} ${a.type} day${left === 1 ? "" : "s"} left, not ${days}`);
    }
    const [row] = await tx.execute(sql`insert into leave.request (tenant_id, person_id, user_id, person_name, legal_entity_id, type, starts_on, ends_on, half_day, days, note, medical_reason, certificate_ref, requested_by)
      values (${ctx.tenantId}, ${p.id}, ${p.userId}, ${p.name}, ${p.legalEntityId}, ${a.type}, ${from}, ${to}, ${a.halfDay ?? null}, ${days}, ${a.note ?? null}, ${a.medicalReason ?? null}, ${a.certificateRef ?? null}, ${by(ctx)})
      returning *`);
    const clashes = await clashesFor(tx, from, to);
    const payload: LeaveRequested = { ...leaveOf(row as RequestRow), clashes: clashes.length };
    return {
      result: { id: row.id as string, person: p.name, type: a.type, dates: dateSpan(from, to, a.halfDay ?? null), days, status: "pending", clashes: clashes.map(clashLabel) },
      resourceId: row.id as string, after: { ...a, startsOn: from, endsOn: to, days }, events: [{ name: EVENTS.requested, payload }],
    };
  },
});
