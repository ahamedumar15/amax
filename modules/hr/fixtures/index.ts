import { sql } from "drizzle-orm";
import type { FixtureSeed, SharedFixtures } from "@amax/core";
import type { Tx } from "@amax/db";
import { fillers, type Filler } from "./fillers";
import { KASUN_DOCS, NAMED } from "./named";

const dayBefore = (iso: string) => new Date(Date.parse(`${iso}T00:00:00Z`) - 86400000).toISOString().slice(0, 10);
const initialsOf = (name: string) => name.split(/\s+/).map((p) => p[0]).join("").slice(0, 2).toUpperCase();
const emailOf = (name: string) => `${name.toLowerCase().replace(/[^a-z ]/g, "").trim().replace(/\s+/g, ".")}@example.dev`;

type Seed = Filler & { initials: string; grade?: string; location?: string; salary?: string; epf?: string; bank?: [string, string]; nextReview?: string };

function named(shared: SharedFixtures): Seed[] {
  return shared.people.map((p) => {
    const d = NAMED[p.key];
    return {
      key: p.key, no: d.no, name: p.name, initials: p.initials, title: d.title ?? p.title, entity: p.entity as "lk" | "au", department: d.department,
      manager: d.manager ?? p.manager ?? (p.key === "sarah" ? undefined : "lead:Leadership"), status: p.status, joined: p.joined ?? d.joined, left: p.left,
      probationEnds: p.probationEnds ?? (p.key === "dinesh" ? "2027-04-05" : undefined), missingDoc: false,
      grade: d.grade, location: d.location, salary: d.salary, epf: d.epf, bank: d.bank, nextReview: d.nextReview,
    };
  });
}

async function insertPerson(tx: Tx, tenantId: string, entityId: string, s: Seed) {
  const [r] = await tx.execute(sql`insert into hr.person (tenant_id, user_id, legal_entity_id, employee_no, name, initials, title, work_email, location, status, joined_on, left_on)
    values (${tenantId}, (select id from auth.user where external_id = ${`demo:${s.key}`}), ${entityId}, ${s.no}, ${s.name}, ${s.initials}, ${s.title},
            ${emailOf(s.name)}, ${s.location ?? (s.entity === "au" ? "Sydney, hybrid" : "Colombo, hybrid")}, ${s.status}, ${s.joined}, ${s.left ?? null})
    on conflict (tenant_id, employee_no) do update set name = excluded.name returning id`);
  return r.id as string;
}

async function insertEmployment(tx: Tx, tenantId: string, personId: string, entityId: string, managerId: string | null, s: Seed, currency: string) {
  const steps = s.fteSteps ?? [{ from: s.joined, fte: 1 }];
  for (const [i, step] of steps.entries()) {
    const ends = steps[i + 1] ? dayBefore(steps[i + 1].from) : (s.contractEnds ?? s.left ?? null);
    await tx.execute(sql`insert into hr.employment (tenant_id, person_id, legal_entity_id, department, grade, manager_person_id, contract, fte, starts_on, ends_on, next_review,
        currency, base_salary, epf_number, bank_name, bank_account)
      values (${tenantId}, ${personId}, ${entityId}, ${s.department}, ${s.grade ?? null}, ${managerId}, ${s.contractEnds ? "fixed-term" : "permanent"}, ${step.fte}, ${step.from}, ${ends},
        ${s.nextReview ?? null}, ${currency}, ${s.salary ?? null}, ${s.epf ?? null}, ${s.bank?.[0] ?? null}, ${s.bank?.[1] ?? null})
      on conflict (person_id, starts_on) do nothing`);
  }
}

async function insertDocs(tx: Tx, tenantId: string, personId: string, s: Seed) {
  const docs = s.key === "kasun" ? [...KASUN_DOCS] : [
    ...(s.missingDoc ? [{ title: "Updated NIC copy", status: "missing", dated: "2026-10-02", class: "personal" }] : []),
    ...(s.healthDoc ? [{ title: "Medical certificate", status: "received", dated: "2026-10-08", class: "health" }] : []),
  ];
  for (const d of docs) {
    await tx.execute(sql`insert into hr.document (tenant_id, person_id, title, class, status, dated_on) select ${tenantId}, ${personId}, ${d.title}, ${d.class}, ${d.status}, ${d.dated}
      where not exists (select 1 from hr.document where person_id = ${personId} and title = ${d.title})`);
  }
  if (s.probationEnds) await tx.execute(sql`insert into hr.probation (tenant_id, person_id, ends_on) select ${tenantId}, ${personId}, ${s.probationEnds}
    where not exists (select 1 from hr.probation where person_id = ${personId})`);
}

// Seeds people, employment, documents and probation for the shared tenant. Safe to re-run.
export const hrFixtures: FixtureSeed = async ({ tx, tenantId, shared }) => {
  const seeds: Seed[] = [...named(shared), ...fillers().map((f) => ({ ...f, initials: initialsOf(f.name) }))];
  const entity = (key: string) => shared.entities.find((e) => e.key === key)!;
  const ids = new Map<string, string>();
  for (const s of seeds) ids.set(s.key, await insertPerson(tx, tenantId, entity(s.entity).id, s));
  const leads = new Map<string, string>();
  for (const s of seeds) if (s.key.startsWith("f") && !leads.has(s.department)) leads.set(s.department, s.key);
  const managerOf = (s: Seed) => (s.manager ? ids.get(s.manager.startsWith("lead:") ? leads.get(s.manager.slice(5))! : s.manager) ?? null : null);
  for (const s of seeds) {
    const e = entity(s.entity);
    await insertEmployment(tx, tenantId, ids.get(s.key)!, e.id, managerOf(s), s, e.baseCurrency);
    await insertDocs(tx, tenantId, ids.get(s.key)!, s);
  }
};
