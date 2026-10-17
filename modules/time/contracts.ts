import { sql } from "drizzle-orm";
import type { Tx } from "@amax/db";
import type { IsoWeek } from "./week";

export { isoWeekOf, parseWeekKey, shiftWeek, weekKey, weekStart, workDays, type IsoWeek } from "./week";

export const WEEK_STATUSES = ["draft", "submitted", "approved", "rejected"] as const;
export type WeekStatus = (typeof WEEK_STATUSES)[number];
export type EntrySource = "person" | "agent";
export type ApprovalChain = "manager" | "project" | "admin";

export type EntryLogged = { entryId: string; weekId: string; userId: string; projectId: string; day: string; hours: number; billable: boolean; source: EntrySource; lockedChange: boolean };
export type WeekSubmitted = { weekId: string; userId: string; week: string; hours: number };
export type WeekDecided = { weekId: string; userId: string; week: string; by: string; chain: ApprovalChain; comment: string | null };
export type WeekReopened = { weekId: string; userId: string; week: string; by: string; reason: string };
export type WeekReminded = { weekId: string; userId: string; week: string; by: string };

export const EVENTS = {
  entryLogged: "time.entry.logged",
  weekSubmitted: "time.week.submitted",
  weekApproved: "time.week.approved",
  weekRejected: "time.week.rejected",
  weekReopened: "time.week.reopened",
  weekReminded: "time.week.reminded",
} as const;

export type PersonWeek = { weekId: string; userId: string; personName: string; status: WeekStatus; hours: number; agentHours: number; billableHours: number };
export type ProjectHours = { projectId: string; hours: number; agentHours: number; billableHours: number };

const n = (v: unknown) => Number(v ?? 0);

export async function weekTotals(tx: Tx, w: IsoWeek): Promise<PersonWeek[]> {
  const rows = await tx.execute(sql`select w.id, w.user_id, w.person_name, w.status, coalesce(sum(e.hours), 0) as hours,
      coalesce(sum(e.hours) filter (where e.source = 'agent'), 0) as agent, coalesce(sum(e.hours) filter (where e.billable), 0) as billable
    from time.week w left join time.entry e on e.week_id = w.id
    where w.iso_year = ${w.year} and w.iso_week = ${w.week} group by w.id order by w.person_name`);
  return rows.map((r) => ({ weekId: r.id as string, userId: r.user_id as string, personName: r.person_name as string, status: r.status as WeekStatus,
    hours: n(r.hours), agentHours: n(r.agent), billableHours: n(r.billable) }));
}

export async function projectHours(tx: Tx, range: { from: string; to: string; approvedOnly?: boolean }): Promise<ProjectHours[]> {
  const approved = range.approvedOnly ? sql`and w.status = 'approved'` : sql``;
  const rows = await tx.execute(sql`select e.project_id, sum(e.hours) as hours, coalesce(sum(e.hours) filter (where e.source = 'agent'), 0) as agent,
      coalesce(sum(e.hours) filter (where e.billable), 0) as billable
    from time.entry e join time.week w on w.id = e.week_id
    where e.day between ${range.from} and ${range.to} ${approved} group by e.project_id order by sum(e.hours) desc`);
  return rows.map((r) => ({ projectId: r.project_id as string, hours: n(r.hours), agentHours: n(r.agent), billableHours: n(r.billable) }));
}
