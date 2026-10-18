import { sql } from "drizzle-orm";
import type { Tx } from "@amax/db";
import type { FixtureSeed } from "@amax/core";
import { contextFor } from "@amax/core/server";
import { listPeople, type PersonRef } from "@amax/hr/contracts";
import { EVENTS, type ApplicationReceived } from "../contracts";
import { GENERATED, HASINI_OFFER, NAMED, NEXT_INTERVIEW, PREVIOUS_DAYS, QUARTER_DAYS, ROLES, type RoleSeed, type Seed } from "./data";

const BY = "fixtures";
const DAY = 86_400_000;
const plus = (t: string, days: number) => new Date(Date.parse(t) + days * DAY).toISOString();
const email = (name: string) => `${name.toLowerCase().replace(/[^a-z]+/g, ".")}@candidates.example`;
const cvFor = (skills: string[], score: number) => {
  const k = Math.max(1, Math.round((score / 100) * skills.length));
  return [{ heading: "Experience", text: `Fictional CV for the demo. Built and ran production systems using ${skills.slice(0, Math.ceil(k / 2)).join(", ")}.` },
    { heading: "Skills", text: `${skills.slice(Math.ceil(k / 2), k).join(", ") || "Teamwork"}. Comfortable presenting to clients.` }];
};

type Ctx = { tx: Tx; tenantId: string; entityId: string };
async function insertApp(c: Ctx, roleId: string, s: { name: string; source: string; cv: unknown }, cols: Record<string, unknown>) {
  const [cand] = await c.tx.execute(sql`insert into recruitment.candidate (tenant_id, legal_entity_id, name, email, source, cv, created_at, decided_at)
    values (${c.tenantId}, ${c.entityId}, ${s.name}, ${email(s.name)}, ${s.source}, ${JSON.stringify(s.cv)}::jsonb, ${cols.applied_at as string}, ${(cols.closed_at ?? cols.hired_at ?? null) as string | null}) returning id`);
  const keys = Object.keys(cols);
  const [a] = await c.tx.execute(sql`insert into recruitment.application (tenant_id, legal_entity_id, role_id, candidate_id, moved_by, ${sql.join(keys.map((k) => sql.identifier(k)), sql`, `)})
    values (${c.tenantId}, ${c.entityId}, ${roleId}, ${cand.id}, ${BY}, ${sql.join(keys.map((k) => sql`${cols[k]}`), sql`, `)}) returning id`);
  return a.id as string;
}

async function insertRole(c: Ctx, r: Pick<RoleSeed, "title" | "department" | "openings" | "skills" | "opened"> & { agent?: string; reason?: string }, status = "open") {
  const [row] = await c.tx.execute(sql`insert into recruitment.role (tenant_id, legal_entity_id, title, department, openings, skills, status, raised_by, reason, opened_at, closed_at)
    values (${c.tenantId}, ${c.entityId}, ${r.title}, ${r.department}, ${r.openings}, ${`{${r.skills.map((s) => JSON.stringify(s)).join(",")}}`}, ${status}, ${r.agent ?? BY}, ${r.reason ?? null}, ${r.opened}, ${status === "open" ? null : r.opened})
    returning id`);
  return row.id as string;
}

/** A hire: one of hr's joiners, with the offer they signed and the link to their HR record. */
const thisQuarter = (p: PersonRef) => (p.joinedOn ?? "") >= "2026-10-01";
async function seedHire(c: Ctx, roles: Map<string, string>, p: PersonRef, days: number, i: number) {
  const hiredAt = thisQuarter(p) ? (p.employeeNo === "LL-0640" ? "2026-10-09T05:00:00Z" : "2026-10-01T03:00:00Z") : plus(`${p.joinedOn}T03:00:00Z`, -14);
  const applied = plus(hiredAt, -days);
  const at = { ...c, entityId: p.legalEntityId };
  const key = `${p.legalEntityId}:${p.title}`;
  if (!roles.has(key)) roles.set(key, await insertRole(at, { title: p.title, department: p.department ?? "Engineering", openings: 1, skills: [], opened: plus(applied, -7) }, "filled"));
  const id = await insertApp(at, roles.get(key)!, { name: p.name, source: ["Referral", "LinkedIn", "Careers page"][i % 3], cv: [] },
    { stage: "hired", applied_at: applied, screened_at: plus(applied, 2), interviewed_at: plus(applied, 6), offered_at: plus(hiredAt, -3), hired_at: hiredAt, person_id: p.id, hr_confirmed_by: BY, hr_confirmed_at: hiredAt });
  await c.tx.execute(sql`insert into recruitment.offer (tenant_id, application_id, legal_entity_id, provider, envelope_id, status, starts_on, sent_at, signed_at, sent_by)
    values (${c.tenantId}, ${id}, ${p.legalEntityId}, 'demo', ${`demo-${id}`}, 'signed', ${p.joinedOn}, ${plus(hiredAt, -3)}, ${hiredAt}, ${BY})`);
}

const STAGE: Record<Seed["stage"], string> = { applied: "applied", screening: "screening", interview: "interview", offer: "offer", "rejected-screening": "rejected", "rejected-interview": "rejected" };

function columnsOf(s: Seed, named: boolean): Record<string, unknown> {
  const applied = named || s.stage === "applied" ? s.at : plus(s.at, -12);
  const cols: Record<string, unknown> = { stage: STAGE[s.stage], applied_at: applied, agent_score: s.score };
  if (s.stage === "applied") return cols;
  Object.assign(cols, { screened_at: plus(applied, 2), match_score: s.score });
  if (s.stage === "screening" || s.stage === "rejected-screening") return s.stage === "screening" ? cols : { ...cols, closed_at: plus(applied, 12), close_note: "Fewer of the role's skills than others in the shortlist (fictional)" };
  Object.assign(cols, { interviewed_at: plus(applied, 6) });
  if (s.stage === "rejected-interview") return { ...cols, closed_at: plus(applied, 12), close_note: "Not a fit after the technical round (fictional)" };
  return s.stage === "offer" ? { ...cols, offered_at: HASINI_OFFER.sent } : cols;
}

async function seedInterviews(c: Ctx, id: string, s: Seed, k: number, interviewed: string) {
  const ravindu = s.name === "Ravindu Jayasuriya";
  const rounds: [number, string, string | null][] = ravindu
    ? [[1, "2026-10-09T05:00:00Z", "passed"], [2, "2026-10-15T05:00:00Z", "passed"], [3, NEXT_INTERVIEW, null]]
    : [[1, plus(interviewed, 1), "passed"], [2, plus(NEXT_INTERVIEW, k + 1), null]];
  for (const [round, at, outcome] of rounds) {
    await c.tx.execute(sql`insert into recruitment.interview (tenant_id, application_id, round, scheduled_at, outcome, recorded_by) values (${c.tenantId}, ${id}, ${round}, ${at}, ${outcome}, ${BY})`);
  }
}

// Seeds the three open roles, this quarter's pipeline, and every hire since May from hr's joiners. The
// screening agent's suggestions for the 22 in Applied come from their events on the next job tick, as
// they would for a real application. Safe to re-run.
export const recruitmentFixtures: FixtureSeed = async ({ tx, tenantId, shared }) => {
  const [{ n }] = await tx.execute(sql`select count(*)::int as n from recruitment.role`);
  if (Number(n) > 0) return;
  const c: Ctx = { tx, tenantId, entityId: shared.entities.find((e) => e.key === "lk")!.id };
  const roles = new Map<string, string>();
  for (const r of ROLES) roles.set(r.key, await insertRole(c, r));
  const skills = new Map(ROLES.map((r) => [r.key, r.skills]));
  let k = 0;
  for (const s of [...NAMED, ...GENERATED]) {
    const named = NAMED.includes(s);
    const cols = columnsOf(s, named);
    const id = await insertApp(c, roles.get(s.role)!, { name: s.name, source: s.source, cv: cvFor(skills.get(s.role)!, s.score) }, cols);
    if (s.stage === "interview") await seedInterviews(c, id, s, k++, cols.interviewed_at as string);
    if (s.stage === "offer") await tx.execute(sql`insert into recruitment.offer (tenant_id, application_id, legal_entity_id, provider, envelope_id, starts_on, sent_at, sent_by)
      values (${tenantId}, ${id}, ${c.entityId}, 'demo', ${`demo-${id}`}, ${HASINI_OFFER.startsOn}, ${HASINI_OFFER.sent}, ${BY})`);
    if (s.stage === "applied") {
      const payload: ApplicationReceived = { applicationId: id, roleId: roles.get(s.role)!, legalEntityId: c.entityId, by: BY };
      await tx.execute(sql`insert into core.event (tenant_id, name, payload) values (${tenantId}, ${EVENTS.applicationReceived}, ${JSON.stringify(payload)}::jsonb)`);
    }
  }
  const people = await listPeople(tx, contextFor.job(tenantId, "recruitment.fixtures"), {});
  const hires = people.filter((p) => ((p.joinedOn ?? "") >= "2026-05-01" && (p.joinedOn ?? "") <= "2026-10-31") || p.employeeNo === "LL-0640");
  const titles = new Map<string, string>();
  let q = 0;
  for (const [i, p] of hires.entries()) await seedHire(c, titles, p, thisQuarter(p) ? QUARTER_DAYS[q++] : PREVIOUS_DAYS, i);
};
