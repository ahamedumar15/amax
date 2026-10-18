import { sql } from "drizzle-orm";
import { z } from "zod";
import { contextFor, defineService } from "@amax/core/server";
import { cron, defineWorkflow, step } from "@amax/workflows";
import { EVENTS, type BreachDeadline } from "../contracts";
import { flagged } from "./incidents";

const DAY = 86_400_000;
/** Reminders start this many days before a breach decision is due, then come daily until it is made. */
export const REMIND_WITHIN_DAYS = 7;

export const daysLeft = (notifyBy: Date, now: Date) => Math.ceil((notifyBy.getTime() - now.getTime()) / DAY);

// Once a day, each undecided breach due within the week (or overdue) reminds its owner through 030.
export const remindBreaches = defineService({
  name: "compliance.incident.remind", action: "compliance:manage", resource: "compliance.incident",
  input: z.object({ now: z.string().datetime().optional() }),
  async run(tx, a) {
    const now = a.now ? new Date(a.now) : new Date();
    const today = now.toISOString().slice(0, 10);
    const due = await tx.execute(sql`select * from compliance.incident where breach and decision is null and status <> 'resolved' and notify_by is not null
      and notify_by <= ${new Date(now.getTime() + REMIND_WITHIN_DAYS * DAY).toISOString()} and (reminded_on is null or reminded_on < ${today}) order by notify_by for update`);
    for (const r of due) await tx.execute(sql`update compliance.incident set reminded_on = ${today} where id = ${r.id}`);
    const events = due.map((r) => ({ name: EVENTS.breachDeadline, payload: { ...flagged(r), daysLeft: daysLeft(new Date(r.notify_by as string), now) } satisfies BreachDeadline }));
    return { result: { reminded: due.map((r) => r.ref as string) }, resourceId: null, after: { reminded: due.length }, events };
  },
});

export const breachReminders = defineWorkflow({
  name: "compliance.breach-reminders",
  title: "Breach deadline reminders",
  async run(ctx) {
    const out = await step("remind", () => remindBreaches(contextFor.job(ctx.tenantId, "compliance.breach-reminders"), {}), { timeout: "2m", retry: { maxAttempts: 3 } });
    return { ok: true, summary: out.reminded.length ? `Reminded the owners of ${out.reminded.join(", ")}` : "No breach decision due this week" };
  },
});

export const breachReminderSchedule = cron({ name: "compliance.breach-reminders", title: "Breach deadline reminders", description: "Reminds incident owners daily while a personal-data breach decision is due within a week", workflow: "compliance.breach-reminders", cron: "0 7 * * *" });
