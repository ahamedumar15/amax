import { sql } from "drizzle-orm";
import { z } from "zod";
import { can, rolesOf, ScopeError, viewerOf, type Viewer } from "@amax/auth";
import { defineService, type Emitted } from "@amax/core/server";
import { EVENTS, type ChecklistCompleted, type ChecklistKind, type TaskCompleted, type TaskOwner } from "../contracts";
import { actorOf, today } from "./read";

/**
 * Who may tick a task off: HR (and Admin) any task in their entities; IT Admin the IT tasks; a manager
 * the tasks that are theirs. A grant limited to "@own" reaches only tasks owned by that sign-in.
 */
export function mayComplete(v: Viewer, t: Record<string, unknown>, legalEntityId: string) {
  const owner = (t.owner_user_id as string | null) ?? undefined;
  if (!can(v, "onboarding:task:complete", { legalEntityId, ownerUserId: owner })) return false;
  const roles = rolesOf(v) as string[];
  return roles.includes("Admin") || roles.includes("HR") || (owner ? owner === v.userId : roles.includes(t.owner as string));
}

export const completeTask = defineService({
  scoped: true,
  name: "onboarding.task.complete",
  action: "onboarding:task:complete",
  resource: "onboarding.task",
  input: z.object({ taskId: z.string().uuid(), note: z.string().trim().max(500).optional().describe("What was done, e.g. \"Laptop LK-2231 handed over\"") }),
  async run(tx, input, ctx) {
    const [t] = await tx.execute(sql`select t.*, c.kind, c.person_id, c.legal_entity_id from onboarding.task t join onboarding.checklist c on c.id = t.checklist_id where t.id = ${input.taskId} for update of t`);
    if (!t) throw new Error("no such task");
    const v = viewerOf(ctx);
    if (v && !mayComplete(v, t, t.legal_entity_id as string)) throw new ScopeError("onboarding:task:complete");
    if (t.done_on) throw new Error(`"${t.title}" is already done`);
    const on = today();
    await tx.execute(sql`update onboarding.task set done_on = ${on}, completed_by = ${actorOf(ctx)}, note = ${input.note ?? null} where id = ${t.id}`);
    const done: TaskCompleted = { checklistId: t.checklist_id as string, taskId: t.id as string, personId: t.person_id as string, owner: t.owner as TaskOwner, title: t.title as string, by: actorOf(ctx) };
    const events: Emitted[] = [{ name: EVENTS.taskCompleted, payload: done }];
    // The last open task completes the checklist.
    const [open] = await tx.execute(sql`select count(*)::int as n from onboarding.task where checklist_id = ${t.checklist_id} and done_on is null`);
    if (Number(open.n) === 0) {
      await tx.execute(sql`update onboarding.checklist set completed_on = ${on} where id = ${t.checklist_id}`);
      const payload: ChecklistCompleted = { checklistId: t.checklist_id as string, kind: t.kind as ChecklistKind, personId: t.person_id as string, completedOn: on, by: actorOf(ctx) };
      events.push({ name: EVENTS.checklistCompleted, payload });
    }
    return { result: { taskId: t.id as string, done: true, checklistComplete: Number(open.n) === 0 }, resourceId: t.id as string, before: { done: false }, after: { done: true, note: input.note ?? null }, events };
  },
});
