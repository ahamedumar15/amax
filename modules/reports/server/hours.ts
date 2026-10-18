import { sql } from "drizzle-orm";
import { z } from "zod";
import type { EventHandlerDef } from "@amax/core";
import { contextFor, defineService } from "@amax/core/server";
import { EVENTS as TIME, type EntryLogged } from "@amax/time/contracts";

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

/** Copies one logged time entry into the hours read model; time's entries are insert-only, so a copy never goes stale. */
export const recordHours = defineService({
  name: "reports.hours.record", action: "reports:admin", resource: "reports.logged_hours",
  input: z.object({ entryId: z.uuid(), userId: z.uuid(), day, hours: z.number().positive().max(24), billable: z.boolean() }),
  async run(tx, a, ctx) {
    await tx.execute(sql`insert into reports.logged_hours (tenant_id, entry_id, user_id, day, hours, billable)
      values (${ctx.tenantId}, ${a.entryId}, ${a.userId}, ${a.day}, ${a.hours}, ${a.billable}) on conflict (entry_id) do nothing`);
    return { result: { entryId: a.entryId }, resourceId: a.entryId, after: { userId: a.userId, day: a.day, hours: a.hours, billable: a.billable } };
  },
});

export const hoursHandler: EventHandlerDef = {
  id: "reports.hours",
  event: TIME.entryLogged,
  async handle({ tenantId, event }) {
    const e = event.payload as EntryLogged;
    await recordHours(contextFor.job(tenantId, "reports.hours"), { entryId: e.entryId, userId: e.userId, day: e.day, hours: e.hours, billable: e.billable });
  },
};
