import { sql } from "drizzle-orm";
import { z } from "zod";
import type { Tx } from "@amax/db";
import { assertCan, can, viewerOf } from "@amax/auth";
import { appendAudit, defineService, type ServiceContext } from "@amax/core/server";
import { getProjectRef } from "@amax/delivery/contracts";
import { EVENTS, type EntryLogged } from "../contracts";
import { isoDate, isoWeekOf } from "../week";
import { by, ensureWeek, keyOf, type WeekRow } from "./weeks";

const input = z.object({
  projectKey: z.string().min(1),
  day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  hours: z.number().positive().max(24).multipleOf(0.05),
  billable: z.boolean().default(true),
  note: z.string().max(500).optional(),
  userId: z.string().uuid().optional(),
  source: z.enum(["person", "agent"]).default("person"),
  agent: z.string().max(80).optional(),
});

async function personOf(tx: Tx, userId: string) {
  const [u] = await tx.execute(sql`select id, name from auth.user where id = ${userId} and status = 'active'`);
  if (!u) throw new Error("no active person with that id");
  return u as { id: string; name: string };
}

async function guardLock(tx: Tx, ctx: ServiceContext, week: WeekRow, after: object) {
  if (week.status !== "approved") return false;
  const v = viewerOf(ctx);
  if (!v || !can(v, "time:admin")) throw new Error(`${keyOf(week)} is approved and locked; only an Admin can change it`);
  await appendAudit(tx, ctx, { action: "time.week.locked_change", resource: "time.week", resourceId: week.id, before: { status: week.status }, after });
  return true;
}

export const logTime = defineService({
  scoped: true,
  name: "time.entry.log",
  action: "time:log",
  resource: "time.entry",
  input,
  async run(tx, a, ctx) {
    const v = viewerOf(ctx);
    const userId = a.userId ?? v?.userId;
    if (!userId) throw new Error("say whose time this is");
    if (v) assertCan(v, "time:log", { ownerUserId: userId });
    const project = await getProjectRef(tx, a.projectKey);
    if (!project) throw new Error(`no project ${a.projectKey}`);
    const day = a.day ?? isoDate(new Date());
    const week = await ensureWeek(tx, ctx.tenantId, await personOf(tx, userId), isoWeekOf(new Date(`${day}T00:00:00Z`)));
    const lockedChange = await guardLock(tx, ctx, week, { day, hours: a.hours, projectKey: a.projectKey });
    const [{ total }] = await tx.execute(sql`select coalesce(sum(hours), 0) as total from time.entry where user_id = ${userId} and day = ${day}`);
    if (Number(total) + a.hours > 24) throw new Error(`that would make ${day} more than 24 h`);
    const [e] = await tx.execute(sql`insert into time.entry (tenant_id, week_id, user_id, project_id, day, hours, billable, source, agent, note, logged_by)
      values (${ctx.tenantId}, ${week.id}, ${userId}, ${project.id}, ${day}, ${a.hours}, ${a.billable}, ${a.source}, ${a.agent ?? null}, ${a.note ?? null}, ${by(ctx)}) returning id`);
    const payload: EntryLogged = { entryId: e.id as string, weekId: week.id, userId, projectId: project.id, day, hours: a.hours, billable: a.billable, source: a.source, lockedChange };
    return { result: { id: e.id as string, week: keyOf(week), day, hours: a.hours }, resourceId: e.id as string, after: { ...a, day }, events: [{ name: EVENTS.entryLogged, payload }] };
  },
});
