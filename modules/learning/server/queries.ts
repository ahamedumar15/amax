import { sql } from "drizzle-orm";
import type { Viewer } from "@amax/auth";
import { dayOf, statusOn, toProgrammeRef, type ProgrammeRef, type ProgrammeStatus } from "../contracts";
import { peopleById, read } from "./read";

export type ProgrammeRow = ProgrammeRef & { detail: string | null; status: ProgrammeStatus; people: number; completion: number; hours: number };

const ROWS = sql`select p.*, (select count(*) from learning.enrolment e where e.programme_id = p.id)::int as people,
    coalesce((select round(avg(e.progress)) from learning.enrolment e where e.programme_id = p.id), 0)::int as completion,
    coalesce((select sum(a.hours) from learning.attendance a join learning.enrolment e on e.id = a.enrolment_id where e.programme_id = p.id), 0)::float as hours
  from learning.programme p`;

const toRow = (r: Record<string, unknown>, on: string): ProgrammeRow => {
  const ref = toProgrammeRef(r);
  return { ...ref, detail: (r.detail as string | null) ?? null, status: statusOn(ref, on), people: Number(r.people), completion: Number(r.completion), hours: Number(r.hours) };
};

/** Every programme, the most hours first: where the time goes leads. */
export const listProgrammes = (v: Viewer, on: string) =>
  read(v, async (tx) => (await tx.execute(sql`${ROWS} order by hours desc, p.title`)).map((r) => toRow(r, on)));

/** One programme by id, with who is enrolled, how far each has got and when they completed. */
export const getProgramme = (v: Viewer, programmeId: string, on: string) =>
  read(v, async (tx) => {
    const [r] = await tx.execute(sql`${ROWS} where p.id = ${programmeId}`);
    if (!r) return null;
    const enrolled = await tx.execute(sql`select person_id, progress, completed_on from learning.enrolment where programme_id = ${programmeId}`);
    const people = await peopleById(tx, v, enrolled.map((e) => e.person_id as string));
    const participants = enrolled.flatMap((e) => {
      const p = people.get(e.person_id as string);
      return p ? [{ employeeNo: p.employeeNo, name: p.name, progress: Number(e.progress), completedOn: dayOf(e.completed_on) }] : [];
    }).sort((a, b) => a.name.localeCompare(b.name));
    return { ...toRow(r, on), participants };
  });

export type CertificationRow = { id: string; personId: string; employeeNo: string; name: string; personName: string; initials: string; issuer: string | null; issuedOn: string; expiresOn: string | null; reminded: string | null };

/** Certifications of the people the viewer may see in hr, soonest expiry first; `until` keeps those lapsing by then. */
export const listCertifications = (v: Viewer, opts: { on: string; until?: string; certificationId?: string; employeeNo?: string }) =>
  read(v, async (tx) => {
    const where = [
      opts.until ? sql`c.expires_on >= ${opts.on}::date and c.expires_on <= ${opts.until}::date` : undefined,
      opts.certificationId ? sql`c.id = ${opts.certificationId}` : undefined,
    ].filter((w) => w !== undefined);
    const rows = await tx.execute(sql`select c.*, (select max(sent_at) from learning.reminder r where r.certification_id = c.id) as reminded
      from learning.certification c ${where.length ? sql`where ${sql.join(where, sql` and `)}` : sql``} order by c.expires_on nulls last, c.name`);
    const people = await peopleById(tx, v, rows.map((r) => r.person_id as string));
    return rows.flatMap((r): CertificationRow[] => {
      const p = people.get(r.person_id as string);
      if (!p || (opts.employeeNo && p.employeeNo !== opts.employeeNo)) return [];
      return [{ id: r.id as string, personId: p.id, employeeNo: p.employeeNo, name: r.name as string, personName: p.name, initials: p.initials, issuer: (r.issuer as string | null) ?? null,
        issuedOn: dayOf(r.issued_on)!, expiresOn: dayOf(r.expires_on), reminded: r.reminded ? new Date(r.reminded as string).toISOString() : null }];
    });
  });
