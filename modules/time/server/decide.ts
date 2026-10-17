import { sql } from "drizzle-orm";
import { z } from "zod";
import type { Tx } from "@amax/db";
import { ScopeError, viewerOf } from "@amax/auth";
import { defineService, type ServiceContext } from "@amax/core/server";
import { EVENTS, type WeekDecided, type WeekReminded } from "../contracts";
import { chainFor } from "./chain";
import { by, findWeek, keyOf, weekProjectIds, type WeekRow } from "./weeks";

const ref = { weekId: z.string().uuid().optional(), person: z.string().optional(), week: z.string().optional() };

async function approver(tx: Tx, ctx: ServiceContext, week: WeekRow) {
  const chain = chainFor(viewerOf(ctx), week.user_id, await weekProjectIds(tx, week.id));
  if (!chain) throw new ScopeError("time:approve");
  return chain;
}

async function decide(tx: Tx, ctx: ServiceContext, week: WeekRow, to: "approved" | "rejected", comment: string | null) {
  const chain = await approver(tx, ctx, week);
  if (week.status !== "submitted") throw new Error(`${keyOf(week)} is ${week.status}, not submitted`);
  await tx.execute(sql`update time.week set status = ${to}, decided_at = now(), decided_by = ${by(ctx)}, reject_comment = ${comment},
    locked_at = ${to === "approved" ? sql`now()` : null}, updated_at = now() where id = ${week.id}`);
  await tx.execute(sql`insert into time.approval (tenant_id, week_id, decision, chain, comment, decided_by) values (${ctx.tenantId}, ${week.id}, ${to}, ${chain}, ${comment}, ${by(ctx)})`);
  const payload: WeekDecided = { weekId: week.id, userId: week.user_id, week: keyOf(week), by: by(ctx), chain, comment };
  return { result: { week: keyOf(week), person: week.person_name as string, status: to, chain }, resourceId: week.id, before: { status: week.status }, after: { status: to, chain, comment },
    events: [{ name: to === "approved" ? EVENTS.weekApproved : EVENTS.weekRejected, payload }] };
}

export const approveWeek = defineService({
  scoped: true, name: "time.week.approve", action: "time:approve", resource: "time.week", input: z.object(ref),
  run: async (tx, a, ctx) => decide(tx, ctx, await findWeek(tx, a), "approved", null),
});

export const rejectWeek = defineService({
  scoped: true, name: "time.week.reject", action: "time:approve", resource: "time.week",
  input: z.object({ ...ref, comment: z.string().trim().min(3, "say why it's rejected").max(1000) }),
  run: async (tx, a, ctx) => decide(tx, ctx, await findWeek(tx, a), "rejected", a.comment),
});

export const remindWeek = defineService({
  scoped: true, name: "time.week.remind", action: "time:approve", resource: "time.week", input: z.object(ref),
  async run(tx, a, ctx) {
    const week = await findWeek(tx, a);
    await approver(tx, ctx, week);
    if (week.status !== "draft" && week.status !== "rejected") throw new Error(`${keyOf(week)} is already ${week.status}`);
    const payload: WeekReminded = { weekId: week.id, userId: week.user_id, week: keyOf(week), by: by(ctx) };
    return { result: { week: keyOf(week), person: week.person_name as string, recorded: true, delivered: false,
      note: "Reminder recorded as an event; it reaches the person once notifications (030) has a rule for it" }, resourceId: week.id, events: [{ name: EVENTS.weekReminded, payload }] };
  },
});
