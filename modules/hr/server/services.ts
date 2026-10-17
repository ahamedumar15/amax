import { sql } from "drizzle-orm";
import { z } from "zod";
import type { Tx } from "@amax/db";
import { ScopeError } from "@amax/auth";
import { defineService, isSystemContext } from "@amax/core/server";
import { CONTRACTS, EVENTS, type PersonJoined, type PersonLeft } from "../contracts";
import { changePersonRun, changeInput } from "./change";
import { date, inScope, inScopeFrom, personByNo, today } from "./records";

const initialsOf = (name: string) => name.trim().split(/\s+/).map((p) => p[0]).join("").slice(0, 2).toUpperCase();

const COUNTRY: Record<string, string> = { "sri lanka": "LK", australia: "AU" };

/** Exactly one legal entity: by id or full name first, else by country (name or code). Never a guess. */
export async function entityOf(tx: Tx, entity: string) {
  const key = entity.trim();
  const code = COUNTRY[key.toLowerCase()] ?? key;
  const rows = await tx.execute(sql`select id, country, base_currency, (id::text = ${key} or lower(name) = lower(${key})) as exact
    from core.legal_entity where id::text = ${key} or lower(name) = lower(${key}) or lower(country) = lower(${code})`);
  const exact = rows.filter((r) => r.exact);
  const hits = exact.length ? exact : rows;
  if (!hits.length) throw new Error(`no legal entity ${key}`);
  if (hits.length > 1) throw new Error(`${key} matches ${hits.length} legal entities: give the entity's full name`);
  return hits[0];
}

/** Next employee number in the entity's series (LL-0641 after LL-0640), serialised per tenant. */
async function nextEmployeeNo(tx: Tx, tenantId: string, entityId: string, country: string) {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`hr.employee_no:${tenantId}`}))`);
  const [r] = await tx.execute(sql`select split_part(employee_no, '-', 1) as prefix, max(nullif(regexp_replace(split_part(employee_no, '-', 2), '\\D', '', 'g'), '')::int) as n
    from hr.person where legal_entity_id = ${entityId} and employee_no ~ '^[A-Z]+-\\d+$' group by 1 order by count(*) desc limit 1`);
  return `${(r?.prefix as string | undefined) ?? country}-${String(Number(r?.n ?? 0) + 1).padStart(4, "0")}`;
}

export const addPerson = defineService({
  scoped: true,
  name: "hr.person.add",
  action: "hr:person:create",
  resource: "hr.person",
  sensitive: { baseSalary: "pay" },
  input: z.object({
    name: z.string().min(2), title: z.string().min(1), department: z.string().min(1), entity: z.string().min(2), joinedOn: date,
    managerEmployeeNo: z.string().optional(), contract: z.enum(CONTRACTS).default("permanent"), fte: z.number().gt(0).max(1).default(1),
    grade: z.string().optional(), workEmail: z.string().email().optional(), baseSalary: z.string().regex(/^\d+(\.\d+)?$/).optional(),
  }),
  async run(tx, input, ctx) {
    const e = await entityOf(tx, input.entity);
    inScope(ctx, "hr:person:create", { legalEntityId: e.id as string, department: input.department });
    const manager = input.managerEmployeeNo ? await personByNo(tx, input.managerEmployeeNo) : null;
    const no = await nextEmployeeNo(tx, ctx.tenantId, e.id as string, e.country as string);
    const status = input.joinedOn > today() ? "joining" : "active";
    const [p] = await tx.execute(sql`insert into hr.person (tenant_id, legal_entity_id, employee_no, name, initials, title, work_email, status, joined_on)
      values (${ctx.tenantId}, ${e.id}, ${no}, ${input.name}, ${initialsOf(input.name)}, ${input.title}, ${input.workEmail ?? null}, ${status}, ${input.joinedOn}) returning id, user_id`);
    await tx.execute(sql`insert into hr.employment (tenant_id, person_id, legal_entity_id, department, grade, manager_person_id, contract, fte, starts_on, currency, base_salary)
      values (${ctx.tenantId}, ${p.id}, ${e.id}, ${input.department}, ${input.grade ?? null}, ${manager?.id ?? null}, ${input.contract}, ${input.fte}, ${input.joinedOn}, ${e.base_currency}, ${input.baseSalary ?? null})`);
    const payload: PersonJoined = { personId: p.id as string, userId: (p.user_id as string | null) ?? null, legalEntityId: e.id as string, department: input.department, joinedOn: input.joinedOn, status };
    return { result: { id: p.id as string, employeeNo: no, status }, resourceId: p.id as string, after: { employeeNo: no, ...input }, events: [{ name: EVENTS.personJoined, payload }] };
  },
});

export const changePerson = defineService({ scoped: true, name: "hr.person.change", action: "hr:person:update", resource: "hr.person", sensitive: { baseSalary: "pay" }, input: changeInput, run: changePersonRun });

export const recordLeaver = defineService({
  scoped: true,
  name: "hr.person.leave",
  action: "hr:person:leave",
  resource: "hr.person",
  input: z.object({ employeeNo: z.string(), leftOn: date, reason: z.string().max(500).optional() }),
  async run(tx, input, ctx) {
    const p = await personByNo(tx, input.employeeNo);
    await inScopeFrom(tx, ctx, "hr:person:leave", p, input.leftOn);
    if (p.status === "left") throw new Error(`${input.employeeNo} has already left`);
    const status = input.leftOn <= today() ? "left" : p.status;
    await tx.execute(sql`update hr.person set left_on = ${input.leftOn}, status = ${status}, updated_at = now() where id = ${p.id}`);
    // Periods that would only start after the last day never happen (a future FTE step, or the whole
    // employment of someone who leaves before their start date); the one in force ends that day.
    const removed = await tx.execute(sql`delete from hr.employment where person_id = ${p.id} and starts_on > ${input.leftOn}::date
      returning id, starts_on::text as "startsOn", ends_on::text as "endsOn", department, grade, manager_person_id as "managerPersonId", contract, fte::float as fte,
        next_review::text as "nextReview", currency, (base_salary is not null) as "hadPay"`);
    const ended = await tx.execute(sql`update hr.employment e set ends_on = ${input.leftOn}, updated_at = now() from hr.employment old
      where old.id = e.id and e.person_id = ${p.id} and (e.ends_on is null or e.ends_on > ${input.leftOn}::date)
      returning e.id, e.starts_on::text as "startsOn", old.ends_on::text as "endsOnBefore"`);
    const payload: PersonLeft = { personId: p.id as string, userId: (p.user_id as string | null) ?? null, leftOn: input.leftOn };
    return { result: { employeeNo: input.employeeNo, status, leftOn: input.leftOn }, resourceId: p.id as string, before: { status: p.status, leftOn: p.left_on ?? null, removedPeriods: removed.map((r) => ({ ...r })), endedPeriods: ended.map((r) => ({ ...r })) }, after: { status, ...input }, events: [{ name: EVENTS.personLeft, payload }] };
  },
});

/**
 * Moves people whose dates have come: 'joining' to 'active' once joined_on passes, anyone to 'left'
 * once left_on passes. Run daily by the hr.person.status job; safe to re-run.
 */
export const applyStatusDates = defineService({
  name: "hr.person.status-dates",
  action: "hr:person:update",
  resource: "hr.person",
  input: z.object({ on: date }),
  async run(tx, { on }, ctx) {
    if (!isSystemContext(ctx)) throw new ScopeError("hr:person:update");
    const left = await tx.execute(sql`update hr.person set status = 'left', updated_at = now() where status <> 'left' and left_on <= ${on}::date returning employee_no`);
    const started = await tx.execute(sql`update hr.person set status = 'active', updated_at = now()
      where status = 'joining' and joined_on <= ${on}::date returning employee_no`);
    const result = { on, started: started.map((r) => r.employee_no as string), left: left.map((r) => r.employee_no as string) };
    return { result, after: result };
  },
});
