import { sql } from "drizzle-orm";
import { z } from "zod";
import { defineService } from "@amax/core/server";
import { getProjectRef } from "@amax/delivery/contracts";
import { EVENTS, type EntryCorrected, type EntryDeleted } from "../contracts";
import { fixedBy, guardFixable, lockedEntry } from "./entry";
import { guardDayTotal, Hours } from "./guards";
import { by, keyOf } from "./weeks";

const reason = z.string().trim().min(3).max(500).optional();
const changes = z.object({
  entryId: z.uuid(),
  hours: Hours.optional(),
  billable: z.boolean().optional(),
  note: z.string().max(500).nullable().optional(),
  projectKey: z.string().min(1).optional(),
  reason,
}).refine((a) => a.hours !== undefined || a.billable !== undefined || a.note !== undefined || a.projectKey !== undefined, "say what to change: hours, billable, note or project");

/** 070 AC-1, AC-13, AC-14: one entry's hours, billable flag, note or project; never its day, which would move it between weeks. */
export const correctEntry = defineService({
  scoped: true, name: "time.entry.correct", action: "time:log", resource: "time.entry", input: changes,
  async run(tx, a, ctx) {
    const { week, entry } = await lockedEntry(tx, ctx, a.entryId);
    guardFixable(week);
    const project = a.projectKey ? await getProjectRef(tx, a.projectKey) : null;
    if (a.projectKey && !project) throw new Error(`no project ${a.projectKey}`);
    const next = { hours: a.hours ?? entry.hours, billable: a.billable ?? entry.billable, note: a.note === undefined ? entry.note : a.note, projectId: project?.id ?? entry.project_id };
    const who = await fixedBy(tx, ctx, entry, next.projectId, a.reason);
    await guardDayTotal(tx, entry.user_id, entry.day, next.hours, entry.id);
    const [{ revision }] = await tx.execute(sql`update time.entry set hours = ${next.hours}, billable = ${next.billable}, note = ${next.note}, project_id = ${next.projectId},
      revision = revision + 1 where id = ${entry.id} returning revision`);
    const before = { hours: entry.hours, billable: entry.billable, projectId: entry.project_id };
    const payload: EntryCorrected = { entryId: entry.id, weekId: week.id, userId: entry.user_id, projectId: next.projectId, day: entry.day, hours: next.hours, billable: next.billable, revision: Number(revision), before, lockedChange: false, week: keyOf(week), ...who };
    return { result: { id: entry.id, week: keyOf(week), day: entry.day, hours: next.hours, revision: Number(revision) }, resourceId: entry.id,
      before: { ...before, note: entry.note }, after: { ...next, reason: who.reason }, events: [{ name: EVENTS.entryCorrected, payload }] };
  },
});

/** 070 AC-2, AC-16: marks one entry deleted under the same rules as a correction; the row and its audit stay. */
export const deleteEntry = defineService({
  scoped: true, name: "time.entry.delete", action: "time:log", resource: "time.entry", input: z.object({ entryId: z.uuid(), reason }),
  async run(tx, a, ctx) {
    const { week, entry } = await lockedEntry(tx, ctx, a.entryId);
    guardFixable(week);
    const who = await fixedBy(tx, ctx, entry, entry.project_id, a.reason);
    const [{ revision }] = await tx.execute(sql`update time.entry set deleted_at = now(), deleted_by = ${by(ctx)}, revision = revision + 1 where id = ${entry.id} returning revision`);
    const payload: EntryDeleted = { entryId: entry.id, weekId: week.id, userId: entry.user_id, projectId: entry.project_id, day: entry.day, hours: entry.hours, revision: Number(revision), lockedChange: false, week: keyOf(week), ...who };
    return { result: { id: entry.id, week: keyOf(week), day: entry.day, deleted: true }, resourceId: entry.id,
      before: { hours: entry.hours, billable: entry.billable, projectId: entry.project_id, day: entry.day }, after: { deleted: true, reason: who.reason }, events: [{ name: EVENTS.entryDeleted, payload }] };
  },
});
