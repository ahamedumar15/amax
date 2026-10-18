import { sql } from "drizzle-orm";
import type { Tx } from "@amax/db";
import { isMasked, type Viewer } from "@amax/auth";
import { ForbiddenError, type ServiceContext } from "@amax/core/server";
import { moneyOf } from "@amax/core";
import { getEmployment, listPeople, type PersonRef } from "@amax/hr/contracts";
import { approvedLeave } from "@amax/leave/contracts";
import { isoWeekOf, weekStart, weekTotals } from "@amax/time/contracts";
import { packFor, totalsOf, type PayInput, type PayLine } from "../packs";
import { periodOf, workingDays } from "./read";

/** Hours a week beyond which approved time counts as overtime. */
export const STANDARD_WEEK_HOURS = 40;

export type Group = { id: string; legal_entity_id: string; currency: string; pack: string; country: string; name: string };
export type DraftSlip = {
  person: PersonRef; costCentre: string; workingDays: number; daysPaid: number; lines: PayLine[]; flags: string[];
  totals: ReturnType<typeof totalsOf>;
};
/** Where the draft's inputs came from, shown on the run: hr always, leave always, time when installed and readable. */
export type Sources = { hr: string; leave: string; time: string };

export async function groupOf(tx: Tx, payGroupId: string): Promise<Group | null> {
  const [g] = await tx.execute(sql`select g.*, e.country from payroll.pay_group g join core.legal_entity e on e.id = g.legal_entity_id where g.id = ${payGroupId}`);
  return (g as Group | undefined) ?? null;
}

const later = (a: string, b: string | null) => (b && b > a ? b : a);
const earlier = (a: string, b: string | null) => (b && b < a ? b : a);
const overlapDays = (from: string, to: string, s: string, e: string, half: boolean) => {
  const a = later(from, s), b = earlier(to, e);
  return a > b ? 0 : half ? 0.5 : workingDays(a, b);
};

export const timeInstalled = async (tx: Tx) => Boolean((await tx.execute(sql`select to_regclass('time.week') is not null as on`))[0]?.on);

/**
 * 009 (optional): hours over the standard week in approved timesheets whose week starts in the
 * period, by sign-in. Time's contract reads as a viewer, so a system draft (fixtures, a job) reads
 * none, and a viewer reads the weeks their time permissions reach. Without time installed: none.
 */
async function overtime(tx: Tx, ctx: ServiceContext, from: string, to: string): Promise<{ hours: Map<string, number>; source: string }> {
  const hours = new Map<string, number>();
  if (!(await timeInstalled(tx))) return { hours, source: "Time isn't installed, so no overtime from timesheets" };
  const viewer = ctx.viewer as Viewer | undefined;
  if (!viewer) return { hours, source: "Drafted by the system, so timesheets weren't read" };
  let weeks = 0;
  try {
    for (let w = isoWeekOf(new Date(`${from}T00:00:00Z`)); weekStart(w).toISOString().slice(0, 10) <= to; w = isoWeekOf(new Date(weekStart(w).getTime() + 7 * 86_400_000))) {
      if (weekStart(w).toISOString().slice(0, 10) < from) continue;
      for (const p of await weekTotals(tx, viewer, w)) {
        if (p.status !== "approved" || p.hours <= STANDARD_WEEK_HOURS) continue;
        hours.set(p.userId, (hours.get(p.userId) ?? 0) + Math.round((p.hours - STANDARD_WEEK_HOURS) * 10) / 10);
      }
      weeks++;
    }
  } catch (e) {
    if (e instanceof ForbiddenError) return { hours: new Map(), source: "Timesheets aren't readable by whoever drafted it, so no overtime from time" };
    throw e;
  }
  return { hours, source: `Approved timesheets, ${weeks} weeks` };
}

/**
 * T3: builds every payslip of a pay group for a month. hr gives who is employed, their cost centre
 * and base salary (pay, read as the drafter: masked pay refuses the draft); leave gives unpaid days;
 * time, when installed, gives overtime; the group's own components add the rest. The pay group's
 * country pack turns that into lines; the engine only sums them.
 */
export async function buildDraft(tx: Tx, ctx: ServiceContext, g: Group, month: string): Promise<{ slips: DraftSlip[]; sources: Sources }> {
  const p = periodOf(month);
  const pack = packFor(g.pack);
  const members = (await tx.execute(sql`select person_id from payroll.pay_group_member where pay_group_id = ${g.id}`)).map((r) => r.person_id as string);
  const people = (await listPeople(tx, ctx, { ids: members, on: p.to }))
    .filter((x) => x.joinedOn && x.joinedOn <= p.to && (!x.leftOn || x.leftOn >= p.from));
  const ids = people.map((x) => x.id);
  const leave = await approvedLeave(tx, ctx, { from: p.from, to: p.to, personIds: ids });
  const time = await overtime(tx, ctx, p.from, p.to);
  const components = ids.length ? await tx.execute(sql`select * from payroll.pay_component where pay_group_id = ${g.id} and starts_on <= ${p.to} and (ends_on is null or ends_on >= ${p.from})
    and person_id::text in (${sql.join(ids.map((i) => sql`${i}`), sql`, `)}) order by created_at, code`) : [];
  const total = workingDays(p.from, p.to);
  const slips: DraftSlip[] = [];
  for (const person of people) {
    const on = earlier(p.to, person.leftOn);
    const job = await getEmployment(tx, person.id, ctx, on);
    if (job && isMasked(job.baseSalary)) throw new ForbiddenError("payroll:run:draft", "hr.employment.base_salary");
    const own = components.filter((c) => c.person_id === person.id);
    const base = job?.baseSalary ? moneyOf(job.baseSalary as string, g.currency) : null;
    if (!base && !own.length) continue;
    const daysPaid = workingDays(later(p.from, person.joinedOn), earlier(p.to, person.leftOn));
    const input: PayInput = {
      personId: person.id, name: person.name, legalEntityId: g.legal_entity_id, country: g.country, currency: g.currency, period: { month, from: p.from, to: p.to },
      workingDays: total, daysPaid, baseSalary: base,
      components: own.map((c) => ({ code: c.code as string, label: c.label as string, kind: c.kind as "earning" | "deduction", amount: moneyOf(String(c.amount), g.currency), basis: (c.basis as string | null) ?? null })),
      unpaidLeaveDays: leave.filter((l) => l.personId === person.id && !l.paid).reduce((n, l) => n + overlapDays(p.from, p.to, l.startsOn, l.endsOn, Boolean(l.halfDay)), 0),
      overtimeHours: person.userId ? (time.hours.get(person.userId) ?? 0) : 0,
    };
    const lines = pack.calculate(input);
    const flags = [...new Set([...(base ? [] : ["no-base-salary"]), ...(daysPaid < total ? ["pro-rata"] : []), ...lines.filter((l) => l.code === "overtime").map(() => "overtime")])];
    slips.push({ person, costCentre: job?.department ?? person.department ?? "Unassigned", workingDays: total, daysPaid, lines, flags, totals: totalsOf(lines, g.currency) });
  }
  return { slips, sources: { hr: "Base salary and cost centre from HR", leave: "Approved leave, unpaid days deducted", time: time.source } };
}
