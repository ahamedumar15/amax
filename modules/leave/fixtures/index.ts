import { sql } from "drizzle-orm";
import type { FixtureSeed } from "@amax/core";
import type { Tx } from "@amax/db";
import { contextFor } from "@amax/core/server";
import { getProjectRef } from "@amax/delivery/contracts";
import { listPeople, type PersonRef } from "@amax/hr/contracts";
import { PACKS } from "../packs";
import { workingDays } from "../server/days";
import { installPack } from "../server/policies";
import { fillerHistory, NAMED, openingTaken, type Seeded } from "./history";

const YEAR = 2026;
// Unused annual leave, Sri Lankan entity (fixtures.md).
const UNUSED_LK = 812;
// Releases in flight in delivery's fixtures: FLT v1.8.0 rolled back from UAT on Oct 14, CON v2.4.0 in QA since Oct 15.
const WINDOWS: [string, string, string, boolean, string, string][] = [["FLT", "v1.8.0", "UAT", true, "2026-10-14", "2026-10-28"], ["CON", "v2.4.0", "QA", false, "2026-10-15", "2026-10-29"]];

async function seedRequest(tx: Tx, tenantId: string, p: PersonRef, s: Seeded, holidays: Set<string>) {
  const days = workingDays(s.from, s.to, holidays).length;
  await tx.execute(sql`insert into leave.request (tenant_id, person_id, user_id, person_name, legal_entity_id, type, starts_on, ends_on, days, status, medical_reason, certificate_ref, requested_by, decided_by, decided_at)
    select ${tenantId}, ${p.id}, ${p.userId}, ${p.name}, ${p.legalEntityId}, ${s.type}, ${s.from}, ${s.to}, ${days}, ${s.status ?? "approved"}, ${s.reason ?? null}, ${s.certificate ?? null}, 'fixtures',
      ${s.status ? null : "fixtures"}, ${s.status ? null : `${s.from}T09:00:00Z`}
    where not exists (select 1 from leave.request where person_id = ${p.id} and starts_on = ${s.from} and type = ${s.type})`);
  return days;
}

async function seedBalances(tx: Tx, tenantId: string, people: PersonRef[], taken: Map<string, Map<string, number>>, lk: string) {
  const lkPeople = people.filter((p) => p.legalEntityId === lk);
  const opening = openingTaken(lkPeople.map((p) => 14 - (taken.get(p.id)?.get("annual") ?? 0)), UNUSED_LK);
  for (const p of people) {
    const pack = PACKS[p.legalEntityId === lk ? "LK" : "AU"];
    for (const pol of pack.policies.filter((x) => x.paid)) {
      const entitled = pol.type === "lieu" ? (taken.get(p.id)?.get("lieu") ?? 0) : (pol.daysPerYear ?? 0);
      const before = pol.type === "annual" && p.legalEntityId === lk ? opening[lkPeople.indexOf(p)] : 0;
      await tx.execute(sql`insert into leave.balance (tenant_id, person_id, user_id, legal_entity_id, type, year, entitled, taken_before)
        values (${tenantId}, ${p.id}, ${p.userId}, ${p.legalEntityId}, ${pol.type}, ${YEAR}, ${entitled}, ${before}) on conflict do nothing`);
    }
  }
}

// Seeds policies and holidays from the country packs, 2026's requests and balances, release windows and the demo's "today". Safe to re-run.
export const leaveFixtures: FixtureSeed = async ({ tx, tenantId, shared }) => {
  for (const e of shared.entities) await installPack(tx, tenantId, { id: e.id, country: e.country });
  await tx.execute(sql`insert into leave.clock_pin (tenant_id, today) values (${tenantId}, ${shared.today}) on conflict (tenant_id) do update set today = excluded.today`);
  const people = await listPeople(tx, contextFor.job(tenantId, "leave.fixtures"), { status: ["active"] });
  const lk = shared.entities.find((e) => e.country === "LK")!.id;
  const holidays = new Set(PACKS.LK.holidays.map((h) => h.on));
  const pool = people.filter((p) => p.legalEntityId === lk && !p.userId && (p.joinedOn ?? "") < `${YEAR}-01-01`);
  const taken = new Map<string, Map<string, number>>();
  for (const s of [...NAMED, ...fillerHistory()]) {
    const p = typeof s.who === "number" ? pool[s.who % pool.length] : people.find((x) => x.name === s.who);
    if (!p) continue;
    const days = await seedRequest(tx, tenantId, p, s, holidays);
    if (s.status) continue;
    const mine = taken.get(p.id) ?? new Map<string, number>();
    taken.set(p.id, mine.set(s.type, (mine.get(s.type) ?? 0) + days));
  }
  await seedBalances(tx, tenantId, people, taken, lk);
  for (const [key, version, environment, retry, from, to] of WINDOWS) {
    const project = await getProjectRef(tx, key);
    if (project) await tx.execute(sql`insert into leave.release_window (tenant_id, project_id, project_key, project_title, version, environment, retry, starts_on, ends_on)
      values (${tenantId}, ${project.id}, ${project.key}, ${project.name}, ${version}, ${environment}, ${retry}, ${from}, ${to}) on conflict do nothing`);
  }
};
