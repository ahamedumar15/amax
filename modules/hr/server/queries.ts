import { sql } from "drizzle-orm";
import { canSee, type Masked, type Viewer } from "@amax/auth";
import type { Sensitivity } from "@amax/core/server";
import { CURRENT, getEmployment, toPersonRef, type Employment, type PersonRef } from "../contracts";
import { readHr } from "./read";

export type DirectoryRow = PersonRef & { country: string; entityName: string; probationEnds: string | null };
export type DocumentRow = { id: string; title: string | Masked; class: string; status: string; datedOn: string | null };
export type PersonView = { person: DirectoryRow; workEmail: string | null; location: string | null; employment: Employment | null; documents: DocumentRow[] };

const day = (v: unknown) => (v ? (v instanceof Date ? v.toISOString() : String(v)).slice(0, 10) : null);

const DIRECTORY = sql`select p.*, emp.department, emp.manager_person_id, mgr.user_id as manager_user_id, mgr.name as manager_name,
    le.country, le.name as entity_name, (select min(ends_on) from hr.probation b where b.person_id = p.id and b.status = 'open') as probation_ends
  from hr.person p ${CURRENT} join core.legal_entity le on le.id = p.legal_entity_id`;

const row = (r: Record<string, unknown>): DirectoryRow => ({ ...toPersonRef(r), country: r.country as string, entityName: r.entity_name as string, probationEnds: day(r.probation_ends) });

/** The directory: shared people with a sign-in first, then by name. `total` counts every match. */
export const listDirectory = (v: Viewer, opts: { entityId?: string; q?: string; limit?: number } = {}) =>
  readHr(v, async (tx) => {
    const where = [sql`p.status <> 'left'`, opts.entityId ? sql`p.legal_entity_id = ${opts.entityId}` : undefined,
      opts.q ? sql`(p.name ilike ${`%${opts.q}%`} or p.title ilike ${`%${opts.q}%`} or emp.department ilike ${`%${opts.q}%`})` : undefined].filter((w): w is ReturnType<typeof sql> => Boolean(w));
    const filter = sql`where ${sql.join(where, sql` and `)}`;
    const [{ n }] = await tx.execute(sql`select count(*)::int as n from hr.person p ${CURRENT} ${filter}`);
    const rows = await tx.execute(sql`${DIRECTORY} ${filter} order by (p.user_id is null and p.status <> 'joining'), p.status = 'joining', p.name limit ${opts.limit ?? 50}`);
    return { total: Number(n), rows: rows.map(row) };
  });

/** One person's page: pay and bank masked per 002, each document masked by its own class. */
export const getPersonView = (v: Viewer, employeeNo: string) =>
  readHr(v, async (tx): Promise<PersonView | null> => {
    const [r] = await tx.execute(sql`${DIRECTORY} where p.employee_no = ${employeeNo}`);
    if (!r) return null;
    const subject = { ownerUserId: (r.user_id as string | null) ?? null, legalEntityId: r.legal_entity_id as string };
    const docs = await tx.execute(sql`select * from hr.document where person_id = ${r.id} order by dated_on desc nulls last, title`);
    return {
      person: row(r), workEmail: (r.work_email as string | null) ?? null, location: (r.location as string | null) ?? null,
      employment: await getEmployment(tx, r.id as string, v),
      documents: docs.map((d) => ({
        id: d.id as string, class: d.class as string, status: d.status as string, datedOn: day(d.dated_on),
        title: d.class === "personal" || canSee(v, d.class as Sensitivity, subject) ? (d.title as string) : { masked: true, class: d.class as Sensitivity },
      })),
    };
  });

export const listEntities = (v: Viewer) =>
  readHr(v, async (tx) => (await tx.execute(sql`select id, country, name from core.legal_entity order by name`)).map((e) => ({ id: e.id as string, code: (e.country as string).toLowerCase(), name: e.name as string })));
