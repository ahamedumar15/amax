import { sql } from "drizzle-orm";

/** Today's date (UTC). The one clock every "in force" read uses unless a date is passed in. */
export const today = () => new Date().toISOString().slice(0, 10);

/** Orders a person's employment periods (alias `e`) so the first is the one in force on `at`, or the first period for someone who hasn't started yet. */
export const inForceOrder = (at: string) =>
  sql`order by (e.starts_on <= ${at}::date) desc, case when e.starts_on <= ${at}::date then e.starts_on end desc nulls last, e.starts_on limit 1`;

/** The scope attributes of a person or employment row: every dimension an assignment can narrow by. Reads, masking and writes all check this one subject. */
export const subjectOf = (row: Record<string, unknown>) => ({
  ownerUserId: (row.user_id as string | null) ?? null, legalEntityId: row.legal_entity_id as string, department: (row.department as string | null) ?? null,
});

/** Joins the employment in force on `at` (alias `emp`) and its manager (alias `mgr`) to `hr.person p`. */
export const employmentAt = (at: string) => sql`left join lateral (select * from hr.employment e where e.person_id = p.id ${inForceOrder(at)}) emp on true
  left join hr.person mgr on mgr.id = emp.manager_person_id`;
