import { sql } from "drizzle-orm";
import { z } from "zod";
import { textArray } from "@amax/db";
import { defineService } from "@amax/core/server";
import { CATEGORIES, DEFAULT_PREFERENCE, EVENTS } from "../contracts";
import { MANAGE, selfOf } from "./context";

const category = z.enum(CATEGORIES.map((c) => c.id) as [string, ...string[]]);
const clock = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "use 24-hour HH:MM");

/** One category's channels and digest for the viewer. Fields left out keep their current value. */
export const setPreference = defineService({
  name: "notifications.preference.set", action: MANAGE, resource: "notifications.preference",
  input: z.object({ category, email: z.boolean().optional(), teams: z.boolean().optional(), digest: z.boolean().optional() })
    .refine((p) => p.email !== undefined || p.teams !== undefined || p.digest !== undefined, "say what to change: email, teams or digest"),
  async run(tx, p, ctx) {
    const userId = selfOf(ctx);
    const [old] = await tx.execute(sql`select email, teams, digest from notifications.preference where user_id = ${userId} and category = ${p.category}`);
    const before = old ? { email: old.email as boolean, teams: old.teams as boolean, digest: old.digest as boolean } : { ...DEFAULT_PREFERENCE };
    const after = { email: p.email ?? before.email, teams: p.teams ?? before.teams, digest: p.digest ?? before.digest };
    await tx.execute(sql`insert into notifications.preference (tenant_id, user_id, category, email, teams, digest) values (${ctx.tenantId}, ${userId}, ${p.category}, ${after.email}, ${after.teams}, ${after.digest})
      on conflict (tenant_id, user_id, category) do update set email = excluded.email, teams = excluded.teams, digest = excluded.digest, updated_at = now()`);
    return { result: { category: p.category, ...after }, resourceId: `${userId}:${p.category}`, before, after,
      events: [{ name: EVENTS.preferenceSet, payload: { userId, category: p.category, ...after } }] };
  },
});

/** Quiet hours, read in the viewer's legal entity's zone; `off` clears them. */
export const setQuietHours = defineService({
  name: "notifications.quiet_hours.set", action: MANAGE, resource: "notifications.quiet_hours",
  input: z.union([z.object({ starts: clock, ends: clock }).refine((q) => q.starts !== q.ends, "start and end must differ"), z.object({ off: z.literal(true) })]),
  async run(tx, q, ctx) {
    const userId = selfOf(ctx);
    const [old] = await tx.execute(sql`select to_char(starts, 'HH24:MI') as starts, to_char(ends, 'HH24:MI') as ends from notifications.quiet_hours where user_id = ${userId}`);
    if ("off" in q) await tx.execute(sql`delete from notifications.quiet_hours where user_id = ${userId}`);
    else await tx.execute(sql`insert into notifications.quiet_hours (tenant_id, user_id, starts, ends) values (${ctx.tenantId}, ${userId}, ${q.starts}, ${q.ends})
      on conflict (tenant_id, user_id) do update set starts = excluded.starts, ends = excluded.ends, updated_at = now()`);
    const after = "off" in q ? null : { starts: q.starts, ends: q.ends };
    return { result: { quietHours: after }, resourceId: userId, before: old ? { starts: old.starts, ends: old.ends } : null, after,
      events: [{ name: EVENTS.quietHoursSet, payload: { userId, quietHours: after } }] };
  },
});

/** Marks the viewer's own notifications read: the ones named, or all of them. */
export const markRead = defineService({
  name: "notifications.notification.read", action: MANAGE, resource: "notifications.notification",
  input: z.union([z.object({ ids: z.array(z.uuid()).min(1).max(100) }), z.object({ all: z.literal(true) })]),
  async run(tx, m, ctx) {
    const userId = selfOf(ctx);
    const which = "all" in m ? sql`` : sql`and id::text = any(${textArray(m.ids)})`;
    const rows = await tx.execute(sql`update notifications.notification set read_at = now() where user_id = ${userId} and read_at is null ${which} returning id`);
    return { result: { marked: rows.length }, resourceId: userId, after: { marked: rows.length }, events: [{ name: EVENTS.read, payload: { userId, count: rows.length } }] };
  },
});
