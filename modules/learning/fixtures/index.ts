import { sql } from "drizzle-orm";
import type { FixtureSeed } from "@amax/core";
import { contextFor } from "@amax/core/server";
import type { Tx } from "@amax/db";
import { listPeople, type PersonRef } from "@amax/hr/contracts";
import { CERTS, ISO, PROGRAMMES, type Cert } from "./data";
import { LAST_DAY, plan, type Enrolment } from "./plan";

const BY = "fixtures";
const addYears = (iso: string, n: number) => `${Number(iso.slice(0, 4)) + n}${iso.slice(4)}`;
const addDays = (iso: string, n: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);

async function insertProgrammes(tx: Tx, tenantId: string) {
  const ids = new Map<string, string>();
  for (const [i, p] of PROGRAMMES.entries()) {
    const [r] = await tx.execute(sql`insert into learning.programme (tenant_id, number, title, kind, delivery, mandatory, detail, starts_on, ends_on, created_by)
      values (${tenantId}, ${i + 1}, ${p.title}, ${p.kind}, ${p.delivery}, ${p.mandatory ?? false}, ${p.detail ?? null}, ${p.starts}, ${p.ends}, ${BY}) returning id`);
    ids.set(p.title, r.id as string);
  }
  return ids;
}

async function insertEnrolment(tx: Tx, tenantId: string, programmeId: string, e: Omit<Enrolment, "programme"> & { enrolled: string }) {
  const [r] = await tx.execute(sql`insert into learning.enrolment (tenant_id, programme_id, person_id, enrolled_on, progress, completed_on, enrolled_by, completed_by)
    values (${tenantId}, ${programmeId}, ${e.person}, ${e.enrolled}, ${e.progress}, ${e.completed}, ${BY}, ${e.completed ? BY : null}) returning id`);
  for (const a of e.rows) await tx.execute(sql`insert into learning.attendance (tenant_id, enrolment_id, on_date, hours) values (${tenantId}, ${r.id}, ${a.on}, ${a.hours})`);
}

/** Everyone active did the mandatory course: by its end, or within three days of joining after it. */
async function insertMandatory(tx: Tx, tenantId: string, programmeId: string, people: PersonRef[]) {
  const iso = PROGRAMMES.find((p) => p.title === ISO)!;
  for (const [i, p] of people.entries()) {
    const joined = p.joinedOn && p.joinedOn > iso.starts ? p.joinedOn : iso.starts;
    const spread = addDays(iso.starts, i % 80);
    const done = joined > iso.ends ? addDays(joined, 3) : spread > joined ? spread : joined;
    const completed = done > LAST_DAY ? LAST_DAY : done;
    await insertEnrolment(tx, tenantId, programmeId, { person: p.id, enrolled: joined, progress: 100, completed, rows: [{ on: completed, hours: 1 }] });
  }
}

function holdersOf(c: Cert, people: PersonRef[], planned: Enrolment[], next: () => PersonRef) {
  if (Array.isArray(c.holders)) return c.holders.map((no) => ({ person: people.find((p) => p.employeeNo === no)!.id, issued: c.issued! }));
  if (c.from) return planned.filter((e) => e.programme.title === c.from && e.completed).slice(0, c.holders).map((e) => ({ person: e.person, issued: e.completed! }));
  return Array.from({ length: c.holders }, () => ({ person: next().id, issued: c.issued! }));
}

// Seeds the programmes, enrolments, hours and certifications of fixtures.md for the shared tenant. Safe to re-run.
export const learningFixtures: FixtureSeed = async ({ tx, tenantId }) => {
  const [{ n }] = await tx.execute(sql`select count(*)::int as n from learning.programme`);
  if (Number(n) > 0) return;
  const people = (await listPeople(tx, contextFor.job(tenantId, "learning.fixtures"), { status: ["active"] })).sort((a, b) => a.employeeNo.localeCompare(b.employeeNo));
  const ids = await insertProgrammes(tx, tenantId);
  await insertMandatory(tx, tenantId, ids.get(ISO)!, people);
  const planned = plan(people.map((p) => p.id));
  for (const e of planned) await insertEnrolment(tx, tenantId, ids.get(e.programme.title)!, { ...e, enrolled: e.programme.starts });
  let at = 140;
  const next = () => people[at++ % people.length];
  for (const c of CERTS) {
    for (const h of holdersOf(c, people, planned, next)) {
      await tx.execute(sql`insert into learning.certification (tenant_id, person_id, name, issuer, programme_id, issued_on, expires_on, recorded_by)
        values (${tenantId}, ${h.person}, ${c.name}, ${c.issuer}, ${c.from ? ids.get(c.from)! : null}, ${h.issued}, ${c.years ? addYears(h.issued, c.years) : c.expires}, ${BY})`);
    }
  }
};
