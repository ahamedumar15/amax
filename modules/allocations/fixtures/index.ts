import { sql } from "drizzle-orm";
import type { FixtureSeed } from "@amax/core";
import { contextFor } from "@amax/core/server";
import type { Tx } from "@amax/db";
import { listProjectRefs } from "@amax/delivery/contracts";
import { listEmploymentPeriods, listPeople, type PersonRef } from "@amax/hr/contracts";
import { fteIn } from "../server/months";
import { DELIVERY_MEMBERS, DEMAND, ENGINEERING_SKILLS, JANUARY, JANUARY_BENCH_SKILLS, MONTHS, NAMED, NAMED_SKILL, spread, TEAM, UNSTAFFED, WORK } from "./plan";

/** The delivery team: Engineering and Quality, plus seven delivery staff without a sign-in. */
async function members(tx: Tx, tenantId: string) {
  const people = await listPeople(tx, contextFor.job(tenantId, "allocations.fixtures"), { status: ["active", "joining"] });
  const delivery = people.filter((p) => p.department === "Delivery" && !p.userId).sort((a, b) => a.employeeNo.localeCompare(b.employeeNo)).slice(0, DELIVERY_MEMBERS);
  const team = [...people.filter((p) => p.department === "Engineering" || p.department === "Quality"), ...delivery];
  let e = 0;
  const skill = (p: PersonRef) => NAMED_SKILL[p.employeeNo] ?? (p.department === "Quality" ? "QA" : p.department === "Delivery" ? "Delivery" : ENGINEERING_SKILLS[e++ % ENGINEERING_SKILLS.length]);
  return team.map((p) => ({ person: p, skill: skill(p) }));
}

const put = (tx: Tx, tenantId: string, personId: string, projectId: string | null, work: string | null, month: string, percent: number) =>
  tx.execute(sql`insert into allocations.allocation (tenant_id, person_id, project_id, work, month, percent, updated_by)
    values (${tenantId}, ${personId}, ${projectId}, ${work}, ${month}, ${percent}, 'fixtures') on conflict do nothing`);

// Seeds the delivery team, the named allocations, generic allocations that hit fixtures.md's demand, and unstaffed demand. Safe to re-run.
export const allocationsFixtures: FixtureSeed = async ({ tx, tenantId }) => {
  const [{ n }] = await tx.execute(sql`select count(*)::int as n from allocations.allocation`);
  if (Number(n) > 0) return;
  const team = await members(tx, tenantId);
  for (const m of team) await tx.execute(sql`insert into allocations.member (tenant_id, person_id, team, skill) values (${tenantId}, ${m.person.id}, ${TEAM}, ${m.skill}) on conflict do nothing`);
  const projects = await listProjectRefs(tx);
  const named = new Set(NAMED.map(([no]) => no));
  for (const [no, key, pcts] of NAMED) {
    const p = team.find((m) => m.person.employeeNo === no)!.person;
    for (const [i, pct] of pcts.entries()) if (pct) await put(tx, tenantId, p.id, projects.find((x) => x.key === key)!.id, null, MONTHS[i], pct);
  }
  for (const [month, label, fte] of UNSTAFFED) await tx.execute(sql`insert into allocations.forecast (tenant_id, team, month, label, demand_fte) values (${tenantId}, ${TEAM}, ${month}, ${label}, ${fte}) on conflict do nothing`);
  const generic = team.filter((m) => !named.has(m.person.employeeNo));
  const periods = await listEmploymentPeriods(tx, contextFor.job(tenantId, "allocations.fixtures"), generic.map((m) => m.person.id));
  const fte = (id: string, month: string) => fteIn(periods.filter((p) => p.personId === id), month);
  const skills = [...JANUARY_BENCH_SKILLS];
  const bench = new Set(generic.filter((m) => fte(m.person.id, MONTHS[JANUARY]) === 1 && fte(m.person.id, MONTHS[0]) === 1 && skills.includes(m.skill) && skills.splice(skills.indexOf(m.skill), 1)).map((m) => m.person.id));
  const workOf = new Map(generic.map((m, k) => [m.person.id, WORK[k % WORK.length]]));
  for (const [i, month] of MONTHS.entries()) {
    const namedFte = NAMED.reduce((s, [, , pcts]) => s + pcts[i] / 100, 0);
    const unstaffed = UNSTAFFED.filter(([m]) => m === month).reduce((s, [, , f]) => s + f, 0);
    const employed = generic.filter((m) => fte(m.person.id, month) > 0).map((m) => ({ id: m.person.id, fte: fte(m.person.id, month), bench: i === JANUARY && bench.has(m.person.id) }));
    const pct = spread(employed, DEMAND[i] - namedFte - unstaffed);
    for (const m of employed) if (pct.get(m.id)) await put(tx, tenantId, m.id, null, workOf.get(m.id)!, month, pct.get(m.id)!);
  }
};
