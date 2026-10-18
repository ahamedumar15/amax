import { sql } from "drizzle-orm";
import { z } from "zod";
import type { Tx } from "@amax/db";
import { defineService, type ServiceContext } from "@amax/core/server";
import { getPerson, listPeople } from "@amax/hr/contracts";
import { EVENTS, type Completed, type Enrolled } from "../contracts";
import { day } from "./programmes";
import { actorOf, today } from "./read";

const employeeNo = z.string().trim().min(1).max(20);

async function lockProgramme(tx: Tx, programmeId: string) {
  const [p] = await tx.execute(sql`select * from learning.programme where id = ${programmeId} for update`);
  if (!p) throw new Error("no such programme");
  return p;
}

/** People as the caller sees them in hr: an HR role limited to one entity can't enrol another's people. */
async function peopleFor(tx: Tx, ctx: ServiceContext, input: { employeeNos?: string[]; everyone?: boolean }) {
  if (input.everyone) return listPeople(tx, ctx, { status: ["active", "joining"] });
  const found = await Promise.all((input.employeeNos ?? []).map(async (no) => [no, await getPerson(tx, ctx, no)] as const));
  const missing = found.filter(([, p]) => !p).map(([no]) => no);
  if (missing.length) throw new Error(`no person ${missing.join(", ")} that you can see in HR`);
  return found.map(([, p]) => p!);
}

export const enrolPeople = defineService({
  name: "learning.enrolment.create",
  action: "learning:enrol",
  resource: "learning.enrolment",
  input: z.object({ programmeId: z.string().uuid(), employeeNos: z.array(employeeNo).min(1).max(500).optional(), everyone: z.boolean().optional() })
    .refine((i) => i.everyone || i.employeeNos?.length, { message: "say who: employee numbers, or everyone" }),
  async run(tx, input, ctx) {
    const p = await lockProgramme(tx, input.programmeId);
    const people = await peopleFor(tx, ctx, input);
    const added: string[] = [];
    for (const person of people) {
      const [row] = await tx.execute(sql`insert into learning.enrolment (tenant_id, programme_id, person_id, enrolled_on, enrolled_by)
        values (${ctx.tenantId}, ${p.id}, ${person.id}, greatest(${today()}::date, ${p.starts_on}::date), ${actorOf(ctx)}) on conflict (programme_id, person_id) do nothing returning id`);
      if (row) added.push(person.id);
    }
    const payload: Enrolled = { programmeId: p.id as string, personIds: added, by: actorOf(ctx) };
    return { result: { enrolled: added.length, already: people.length - added.length }, resourceId: p.id as string, after: { enrolled: added.length },
      events: added.length ? [{ name: EVENTS.enrolled, payload }] : [] };
  },
});

export const recordCompletion = defineService({
  name: "learning.enrolment.complete",
  action: "learning:enrol",
  resource: "learning.enrolment",
  input: z.object({ programmeId: z.string().uuid(), employeeNo, progress: z.number().int().min(0).max(100).default(100), on: day.optional(), hours: z.number().positive().max(24).optional() }),
  async run(tx, input, ctx) {
    const person = await getPerson(tx, ctx, input.employeeNo);
    if (!person) throw new Error(`no person ${input.employeeNo} that you can see in HR`);
    const [e] = await tx.execute(sql`select * from learning.enrolment where programme_id = ${input.programmeId} and person_id = ${person.id} for update`);
    if (!e) throw new Error(`${person.name} isn't enrolled in that programme; enrol them first`);
    if (input.progress < Number(e.progress)) throw new Error(`progress only goes up: ${person.name} is already at ${e.progress}%`);
    const on = input.on ?? today();
    const done = input.progress === 100;
    await tx.execute(sql`update learning.enrolment set progress = ${input.progress}, completed_on = ${done ? sql`coalesce(completed_on, ${on}::date)` : null},
      completed_by = ${done ? sql`coalesce(completed_by, ${actorOf(ctx)})` : null} where id = ${e.id}`);
    if (input.hours) await tx.execute(sql`insert into learning.attendance (tenant_id, enrolment_id, on_date, hours) values (${ctx.tenantId}, ${e.id}, ${on}, ${input.hours})`);
    const payload: Completed = { enrolmentId: e.id as string, programmeId: input.programmeId, personId: person.id, completedOn: on, by: actorOf(ctx) };
    return { result: { id: e.id as string, progress: input.progress, completed: done }, resourceId: e.id as string, before: { progress: Number(e.progress) }, after: { progress: input.progress, hours: input.hours ?? null },
      events: done && e.completed_on === null ? [{ name: EVENTS.completed, payload }] : [] };
  },
});
