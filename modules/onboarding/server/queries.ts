import { sql } from "drizzle-orm";
import { can, roleLabel, type Viewer } from "@amax/auth";
import { dayOf, type ChecklistKind, type TaskOwner } from "../contracts";
import { mayComplete } from "./tasks";
import { addDays, read } from "./read";

/** Joiners starting within this many days, and leavers leaving within a week, lead the screen. */
export const SOON_DAYS = 30;
export const WEEK_DAYS = 7;

export type TaskRow = {
  id: string; checklistId: string; title: string; owner: TaskOwner; ownerLabel: string; ownerUserId: string | null; access: "grant" | "revoke" | null;
  dueOn: string; doneOn: string | null; completedBy: string | null; note: string | null; overdue: boolean; canComplete: boolean;
};
export type ExitState = { issuedAt: string; expiresAt: string; answeredAt: string | null; answers: Record<string, string> | null };
export type ChecklistRow = {
  id: string; kind: ChecklistKind; personId: string; personName: string; initials: string; employeeNo: string; jobTitle: string | null; department: string | null;
  legalEntityId: string; managerName: string | null; startsOn: string; completedOn: string | null; tasks: TaskRow[]; done: number; overdue: number; exit: ExitState | null;
};

const initialsOf = (name: string) => name.trim().split(/\s+/).map((p) => p[0]).join("").slice(0, 2).toUpperCase();
const iso = (v: unknown) => (v ? new Date(v as string).toISOString() : null);

/** A viewer sees a checklist in their entities, or (a manager on "@own") one with a task of theirs. */
const sees = (v: Viewer, c: Record<string, unknown>, tasks: Record<string, unknown>[]) =>
  can(v, "onboarding:read", { legalEntityId: c.legal_entity_id as string }) ||
  tasks.some((t) => t.owner_user_id && can(v, "onboarding:read", { legalEntityId: c.legal_entity_id as string, ownerUserId: t.owner_user_id as string }));

const toTask = (v: Viewer, c: Record<string, unknown>, t: Record<string, unknown>, on: string): TaskRow => ({
  id: t.id as string, checklistId: t.checklist_id as string, title: t.title as string, owner: t.owner as TaskOwner,
  ownerLabel: t.owner === "Manager" ? ((c.manager_name as string | null) ?? "Manager") : roleLabel(t.owner as string),
  ownerUserId: (t.owner_user_id as string | null) ?? null, access: (t.access as "grant" | "revoke" | null) ?? null,
  dueOn: dayOf(t.due_on)!, doneOn: dayOf(t.done_on), completedBy: (t.completed_by as string | null) ?? null, note: (t.note as string | null) ?? null,
  overdue: !t.done_on && dayOf(t.due_on)! < on, canComplete: !t.done_on && mayComplete(v, t, c.legal_entity_id as string),
});

async function checklists(v: Viewer, on: string, where = sql``): Promise<ChecklistRow[]> {
  return read(v, async (tx) => {
    const rows = await tx.execute(sql`select c.*, x.issued_at, x.expires_at, x.answered_at, x.answers from onboarding.checklist c
      left join onboarding.exit_link x on x.checklist_id = c.id ${where} order by c.starts_on, c.person_name`);
    const ids = rows.map((r) => r.id as string);
    const tasks = ids.length ? await tx.execute(sql`select * from onboarding.task where checklist_id in (${sql.join(ids.map((i) => sql`${i}`), sql`, `)}) order by due_on, position`) : [];
    return rows.flatMap((c): ChecklistRow[] => {
      const own = tasks.filter((t) => t.checklist_id === c.id);
      if (!sees(v, c, own)) return [];
      const list = own.map((t) => toTask(v, c, t, on));
      return [{
        id: c.id as string, kind: c.kind as ChecklistKind, personId: c.person_id as string, personName: c.person_name as string, initials: initialsOf(c.person_name as string),
        employeeNo: c.employee_no as string, jobTitle: (c.job_title as string | null) ?? null, department: (c.department as string | null) ?? null, legalEntityId: c.legal_entity_id as string,
        managerName: (c.manager_name as string | null) ?? null, startsOn: dayOf(c.starts_on)!, completedOn: dayOf(c.completed_on), tasks: list,
        done: list.filter((t) => t.doneOn).length, overdue: list.filter((t) => t.overdue).length,
        exit: c.issued_at ? { issuedAt: iso(c.issued_at)!, expiresAt: iso(c.expires_at)!, answeredAt: iso(c.answered_at), answers: (c.answers as Record<string, string> | null) ?? null } : null,
      }];
    });
  });
}

/** Checklists the viewer may see, soonest start first. `open` keeps those not yet complete. */
export const listChecklists = (v: Viewer, on: string, opts: { kind?: ChecklistKind; open?: boolean } = {}) =>
  checklists(v, on, opts.kind || opts.open
    ? sql`where ${sql.join([opts.kind ? sql`c.kind = ${opts.kind}` : undefined, opts.open ? sql`c.completed_on is null` : undefined].filter((w) => w !== undefined), sql` and `)}`
    : sql``);

/** One checklist by id with its tasks; exit answers only for HR (a leaver answers HR, not their manager or IT). */
export async function getChecklist(v: Viewer, checklistId: string, on: string) {
  const [c] = await checklists(v, on, sql`where c.id = ${checklistId}`);
  if (!c) return null;
  return c.exit && !can(v, "onboarding:exit:send", { legalEntityId: c.legalEntityId }) ? { ...c, exit: { ...c.exit, answers: null } } : c;
}

/** One task by id, with whose checklist it is. */
export async function getTask(v: Viewer, taskId: string, on: string) {
  const [c] = await checklists(v, on, sql`where c.id = (select checklist_id from onboarding.task where id = ${taskId})`);
  const t = c?.tasks.find((x) => x.id === taskId);
  return t && c ? { ...t, personName: c.personName, kind: c.kind, startsOn: c.startsOn } : null;
}

/** What needs attention first: overdue tasks, joiners starting soon, leavers this week. */
export async function onboardingSummary(v: Viewer, on: string) {
  const all = await listChecklists(v, on, { open: true });
  const overdue = all.flatMap((c) => c.tasks.filter((t) => t.overdue).map((t) => ({ ...t, personName: c.personName, initials: c.initials, personId: c.personId })));
  const joiners = all.filter((c) => c.kind === "joiner" && c.startsOn >= on && c.startsOn <= addDays(on, SOON_DAYS));
  const leavers = all.filter((c) => c.kind === "leaver" && c.startsOn >= on && c.startsOn <= addDays(on, WEEK_DAYS));
  const open = all.flatMap((c) => c.tasks).filter((t) => !t.doneOn).length;
  return { on, open: { checklists: all.length, tasks: open }, overdue, joiners, leavers };
}

export type OnboardingSummary = Awaited<ReturnType<typeof onboardingSummary>>;
