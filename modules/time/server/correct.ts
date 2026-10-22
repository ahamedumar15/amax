import { sql } from "drizzle-orm";
import { z } from "zod";
import { defineService } from "@amax/core/server";
import { getProjectRef } from "@amax/delivery/contracts";
import { EVENTS, type EntryCorrected, type EntryDeleted } from "../contracts";
import { lockedEntry } from "./entry";
import { guardDayTotal, guardLock, Hours } from "./guards";
import { keyOf } from "./weeks";

const changes = z.object({
  entryId: z.uuid(),
  hours: Hours.optional(),
  billable: z.boolean().optional(),
  note: z.string().max(500).nullable().optional(),
  projectKey: z.string().min(1).optional(),
}).refine((a) => a.hours !== undefined || a.billable !== undefined || a.note !== undefined || a.projectKey !== undefined, "say what to change: hours, billable, note or project");

/** 070 AC-1: one entry's hours, billable flag, note or project; never its day, which would move it between weeks. */
export const correctEntry = defineService({
  scoped: true, name: "time.entry.correct", action: "time:log", resource: "time.entry", input: changes,
  async run(tx, a, ctx) {
    const { week, entry } = await lockedEntry(tx, ctx, a.entryId);
    const project = a.projectKey ? await getProjectRef(tx, a.projectKey) : null;
    if (a.projectKey && !project) throw new Error(`no project ${a.projectKey}`);
    const next = { hours: a.hours ?? entry.hours, billable: a.billable ?? entry.billable, note: a.note === undefined ? entry.note : a.note, projectId: project?.id ?? entry.project_id };
    const lockedChange = await guardLock(tx, ctx, week, { entryId: entry.id, ...next });
    await guardDayTotal(tx, entry.user_id, entry.day, next.hours, entry.id);
    const [{ revision }] = await tx.execute(sql`update time.entry set hours = ${next.hours}, billable = ${next.billable}, note = ${next.note}, project_id = ${next.projectId},
      revision = revision + 1 where id = ${entry.id} returning revision`);
    const before = { hours: entry.hours, billable: entry.billable, projectId: entry.project_id };
    const payload: EntryCorrected = { entryId: entry.id, weekId: week.id, userId: entry.user_id, projectId: next.projectId, day: entry.day, hours: next.hours, billable: next.billable, revision: Number(revision), before, lockedChange };
    return { result: { id: entry.id, week: keyOf(week), day: entry.day, hours: next.hours, revision: Number(revision) }, resourceId: entry.id,
      before: { ...before, note: entry.note }, after: next, events: [{ name: EVENTS.entryCorrected, payload }] };
  },
});

/** 070 AC-2: removes one entry under the same rules as a correction. */
export const deleteEntry = defineService({
  scoped: true, name: "time.entry.delete", action: "time:log", resource: "time.entry", input: z.object({ entryId: z.uuid() }),
  async run(tx, a, ctx) {
    const { week, entry } = await lockedEntry(tx, ctx, a.entryId);
    const lockedChange = await guardLock(tx, ctx, week, { entryId: entry.id, deleted: true });
    await tx.execute(sql`delete from time.entry where id = ${entry.id}`);
    const payload: EntryDeleted = { entryId: entry.id, weekId: week.id, userId: entry.user_id, projectId: entry.project_id, day: entry.day, hours: entry.hours, revision: entry.revision + 1, lockedChange };
    return { result: { id: entry.id, week: keyOf(week), day: entry.day, deleted: true }, resourceId: entry.id,
      before: { hours: entry.hours, billable: entry.billable, projectId: entry.project_id, day: entry.day }, after: null, events: [{ name: EVENTS.entryDeleted, payload }] };
  },
});
