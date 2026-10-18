import { sql } from "drizzle-orm";
import { z } from "zod";
import type { EventHandlerDef } from "@amax/core";
import type { Tx } from "@amax/db";
import { contextFor, defineService, type Emitted, type ServiceContext } from "@amax/core/server";
import { EVENTS as HR, getPerson, type PersonJoined, type PersonLeft, type PersonRef } from "@amax/hr/contracts";
import { EVENTS, KINDS, type ChecklistKind, type ChecklistStarted, type TaskOwner } from "../contracts";
import { actorOf, addDays } from "./read";

type Planned = { title: string; owner: TaskOwner; ownerUserId: string | null; dueOn: string };

/** The template for this person: the one matching most of legal entity and role (department or job title); null fields match anyone. */
async function templateFor(tx: Tx, kind: ChecklistKind, p: PersonRef) {
  const role = [p.department ?? "", p.title].map((s) => s.toLowerCase());
  const [t] = await tx.execute(sql`select * from onboarding.template where kind = ${kind}
      and (legal_entity_id is null or legal_entity_id = ${p.legalEntityId})
      and (role is null or lower(role) in (${role[0]}, ${role[1]}))
    order by (legal_entity_id is not null)::int + (role is not null)::int desc, (role is not null) desc, created_at limit 1`);
  return t ?? null;
}

// 013 AC-1: tasks go to their owners. A manager task goes to the person's manager by sign-in; with no
// manager who can sign in it goes to HR, so nothing waits on nobody.
async function planFrom(tx: Tx, templateId: string | null, p: PersonRef, startsOn: string): Promise<Planned[]> {
  if (!templateId) return [];
  const rows = await tx.execute(sql`select * from onboarding.template_task where template_id = ${templateId} order by position`);
  return rows.map((r) => {
    const manager = r.owner === "Manager" && p.managerUserId ? p.managerUserId : null;
    return { title: r.title as string, owner: (r.owner === "Manager" && !manager ? "HR" : r.owner) as TaskOwner, ownerUserId: manager, dueOn: addDays(startsOn, Number(r.due_days)) };
  });
}

/**
 * Starts the person's joiner or leaver checklist from the best template. Once per person and kind: a
 * second start (an event delivered twice, or a person re-recorded) returns the first checklist.
 */
export async function startFor(tx: Tx, ctx: ServiceContext, input: { personId: string; kind: ChecklistKind }) {
  // hr's contract read: the trusted job context (event handler, fixtures) sees everyone; a person sees their entities.
  const p = await getPerson(tx, ctx, input.personId);
  if (!p) throw new Error("no such person that you can see in HR");
  const [existing] = await tx.execute(sql`select id from onboarding.checklist where kind = ${input.kind} and person_id = ${p.id}`);
  if (existing) return { id: existing.id as string, started: false, tasks: 0, events: [] as Emitted[] };
  const startsOn = input.kind === "joiner" ? p.joinedOn : p.leftOn;
  if (!startsOn) throw new Error(input.kind === "joiner" ? `${p.name} has no joining date in HR` : `${p.name} has no last day in HR`);
  const template = await templateFor(tx, input.kind, p);
  const plan = await planFrom(tx, (template?.id as string | undefined) ?? null, p, startsOn);
  const [c] = await tx.execute(sql`insert into onboarding.checklist (tenant_id, kind, person_id, person_name, employee_no, job_title, department, legal_entity_id, manager_user_id, manager_name, template_id, starts_on, created_by)
    values (${ctx.tenantId}, ${input.kind}, ${p.id}, ${p.name}, ${p.employeeNo}, ${p.title}, ${p.department}, ${p.legalEntityId}, ${p.managerUserId}, ${p.managerName}, ${template?.id ?? null}, ${startsOn}, ${actorOf(ctx)}) returning id`);
  for (const [i, t] of plan.entries()) {
    await tx.execute(sql`insert into onboarding.task (tenant_id, checklist_id, position, title, owner, owner_user_id, due_on)
      values (${ctx.tenantId}, ${c.id}, ${i + 1}, ${t.title}, ${t.owner}, ${t.ownerUserId}, ${t.dueOn})`);
  }
  const payload: ChecklistStarted = { checklistId: c.id as string, kind: input.kind, personId: p.id, legalEntityId: p.legalEntityId, startsOn, templateId: (template?.id as string | undefined) ?? null, tasks: plan.length, by: actorOf(ctx) };
  return { id: c.id as string, started: true, tasks: plan.length, events: [{ name: EVENTS.checklistStarted, payload }] as Emitted[] };
}

export const startChecklist = defineService({
  name: "onboarding.checklist.start",
  action: "onboarding:checklist:start",
  resource: "onboarding.checklist",
  input: z.object({ personId: z.string().min(1).max(40).describe("The person's hr.person id or employee number"), kind: z.enum(KINDS) }),
  async run(tx, input, ctx) {
    const { events, ...result } = await startFor(tx, ctx, input);
    return { result, resourceId: result.id, after: { ...input, started: result.started, tasks: result.tasks }, events };
  },
});

// 013 AC-1: hr's joined and left events start the checklist, acting as the onboarding job.
const handler = (id: string, event: string, kind: ChecklistKind): EventHandlerDef => ({
  id,
  event,
  async handle({ tenantId, event: e }) {
    const p = e.payload as PersonJoined | PersonLeft;
    await startChecklist(contextFor.job(tenantId, id), { personId: p.personId, kind });
  },
});
export const joinedHandler = handler("onboarding.joiner", HR.personJoined, "joiner");
export const leftHandler = handler("onboarding.leaver", HR.personLeft, "leaver");
