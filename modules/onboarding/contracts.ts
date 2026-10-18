// The only import surface for other modules (docs/module-standard.md). Reads run in the caller's
// tenant transaction; people are hr.person ids. 021 (it-access) builds on `onboarding.access.requested`.
import { sql } from "drizzle-orm";
import type { Tx } from "@amax/db";

export const KINDS = ["joiner", "leaver"] as const;
export type ChecklistKind = (typeof KINDS)[number];
/** Who a task goes to: a role, or the person's manager (falls back to HR when there's none on record). */
export const OWNERS = ["HR", "ITAdmin", "Manager"] as const;
export type TaskOwner = (typeof OWNERS)[number];
export type AccessKind = "grant" | "revoke";

/** 013 AC-3: an exit questionnaire link works once, for this many days. */
export const EXIT_LINK_DAYS = 14;
export const EXIT_QUESTIONS = [
  { id: "reason", text: "What made you decide to leave?" },
  { id: "liked", text: "What did you like most about working here?" },
  { id: "change", text: "What one thing should we change?" },
  { id: "recommend", text: "Would you recommend us to a friend, and why?" },
] as const;
export type ExitAnswers = Partial<Record<(typeof EXIT_QUESTIONS)[number]["id"], string>>;

export type ChecklistRef = {
  id: string; kind: ChecklistKind; personId: string; legalEntityId: string; startsOn: string;
  tasks: number; done: number; completedOn: string | null;
};

export const EVENTS = {
  checklistStarted: "onboarding.checklist.started",
  taskCompleted: "onboarding.task.completed",
  checklistCompleted: "onboarding.checklist.completed",
  accessRequested: "onboarding.access.requested",
  exitLinkIssued: "onboarding.exit.issued",
  exitAnswered: "onboarding.exit.answered",
} as const;
export type ChecklistStarted = { checklistId: string; kind: ChecklistKind; personId: string; legalEntityId: string; startsOn: string; templateId: string | null; tasks: number; by: string };
export type TaskCompleted = { checklistId: string; taskId: string; personId: string; owner: TaskOwner; title: string; by: string };
export type ChecklistCompleted = { checklistId: string; kind: ChecklistKind; personId: string; completedOn: string; by: string };
/**
 * 013 AC-2: a suggestion for IT, never an action. 021 (it-access) turns it into a grant or revoke
 * suggestion IT approves; until then an IT Admin checklist task carries it. `userId` is the person's
 * sign-in, when they have one.
 */
export type AccessRequested = { personId: string; userId: string | null; kind: AccessKind; legalEntityId: string };
/** The link itself is never in the outbox: only that one was issued, and until when. */
export type ExitLinkIssued = { checklistId: string; personId: string; expiresAt: string; by: string };
export type ExitAnswered = { checklistId: string; personId: string; answeredAt: string };

export const dayOf = (v: unknown) => (v === null || v === undefined ? null : v instanceof Date ? v.toISOString().slice(0, 10) : String(v).slice(0, 10));

const REFS = sql`select c.*, (select count(*) from onboarding.task t where t.checklist_id = c.id)::int as tasks,
    (select count(*) from onboarding.task t where t.checklist_id = c.id and t.done_on is not null)::int as done from onboarding.checklist c`;

export const toChecklistRef = (r: Record<string, unknown>): ChecklistRef => ({
  id: r.id as string, kind: r.kind as ChecklistKind, personId: r.person_id as string, legalEntityId: r.legal_entity_id as string,
  startsOn: dayOf(r.starts_on)!, tasks: Number(r.tasks ?? 0), done: Number(r.done ?? 0), completedOn: dayOf(r.completed_on),
});

/** One person's checklists (a joiner's, and a leaver's once they leave), newest first. */
export async function checklistsOf(tx: Tx, personId: string): Promise<ChecklistRef[]> {
  return (await tx.execute(sql`${REFS} where c.person_id = ${personId} order by c.starts_on desc`)).map(toChecklistRef);
}

/** Checklists not yet complete, soonest start first. */
export async function openChecklists(tx: Tx, kind?: ChecklistKind): Promise<ChecklistRef[]> {
  return (await tx.execute(sql`${REFS} where c.completed_on is null ${kind ? sql`and c.kind = ${kind}` : sql``} order by c.starts_on, c.id`)).map(toChecklistRef);
}
