import { sql } from "drizzle-orm";
import type { Viewer } from "@amax/auth";
import { listPeople } from "@amax/hr/contracts";
import { COMPLETION_TARGET } from "../contracts";
import { read, yearOf } from "./read";

const IN_YEAR = (from: string, to: string) => sql`p.starts_on <= ${to}::date and (p.ends_on is null or p.ends_on >= ${from}::date)`;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/**
 * The Learning screen's figures for the year of `on`. Optional programmes are every one that isn't
 * mandatory; the share is of the active headcount the viewer sees in hr. Participation counts the
 * people with hours in an optional programme each month, up to this month.
 */
export const learningStats = (v: Viewer, on: string) =>
  read(v, async (tx) => {
    const { from, to } = yearOf(on);
    const [p] = await tx.execute(sql`select count(*)::int as n, count(*) filter (where delivery = 'internal')::int as internal from learning.programme p where ${IN_YEAR(from, to)}`);
    const [o] = await tx.execute(sql`select count(distinct e.person_id)::int as people, coalesce(round(avg(e.progress)), 0)::int as completion
      from learning.enrolment e join learning.programme p on p.id = e.programme_id where not p.mandatory and ${IN_YEAR(from, to)}`);
    const mandatory = await tx.execute(sql`select p.title, count(e.id) filter (where e.completed_on is not null)::int as completed
      from learning.programme p left join learning.enrolment e on e.programme_id = p.id where p.mandatory and ${IN_YEAR(from, to)} group by p.id, p.title order by p.title`);
    const [c] = await tx.execute(sql`select count(*) filter (where expires_on is null or expires_on >= ${on}::date)::int as valid,
      count(*) filter (where expires_on >= ${on}::date and expires_on <= ${to}::date)::int as expiring from learning.certification`);
    const monthly = await tx.execute(sql`select extract(month from a.on_date)::int as m, count(distinct e.person_id)::int as n
      from learning.attendance a join learning.enrolment e on e.id = a.enrolment_id join learning.programme p on p.id = e.programme_id
      where not p.mandatory and a.on_date between ${from}::date and ${on}::date group by 1`);
    const headcount = (await listPeople(tx, v, { status: ["active"], on })).length;
    const upTo = Number(on.slice(5, 7));
    return {
      year: Number(on.slice(0, 4)), headcount,
      programmes: { total: Number(p.n), internal: Number(p.internal), external: Number(p.n) - Number(p.internal) },
      optional: { people: Number(o.people), share: headcount ? Math.round((Number(o.people) / headcount) * 100) : 0 },
      completion: { rate: Number(o.completion), target: COMPLETION_TARGET },
      mandatory: mandatory.map((m) => ({ title: m.title as string, completed: Number(m.completed) })),
      certifications: { valid: Number(c.valid), expiringThisYear: Number(c.expiring) },
      participation: MONTHS.slice(0, upTo).map((month, i) => ({ month, people: Number(monthly.find((r) => Number(r.m) === i + 1)?.n ?? 0) })),
    };
  });

export type LearningStats = Awaited<ReturnType<typeof learningStats>>;
