import { sql } from "drizzle-orm";
import type { Tx } from "@amax/db";
import type { Choice, Dimension, GroupScore, MyExperience, ScoreDrop } from "../contracts";
import { addDays, entitiesOf, todayOf, uuids, type Reader } from "./read";
import { groupsOf, partsOf, round1, type Answer, type Reading } from "./score";

const SITE: Record<string, string> = { LK: "Sri Lanka", AU: "Australia" };
export type Latest = { deviceId: string; person: string; ownerUserId: string | null; department: string | null; model: string; entity: string; startup: number; app: number; crashes: number; risk: string };

/** Each device's latest reading in the last 30 days, in the given legal entities. */
export async function latestReadings(tx: Tx, entities: string[], today: string): Promise<Latest[]> {
  const rows = await tx.execute(sql`select distinct on (r.device_id) r.device_id, d.owner_user_id, d.person_id, d.department, d.model, d.legal_entity_id, r.startup_score, r.app_score, r.crashes, r.risk
    from experience.device_day r join experience.device d on d.id = r.device_id
    where d.legal_entity_id = any(${uuids(entities)}::uuid[]) and r.day <= ${today}::date and r.day > ${today}::date - 30 order by r.device_id, r.day desc`);
  return rows.map((r) => ({ deviceId: r.device_id as string, person: (r.person_id ?? r.owner_user_id ?? r.device_id) as string, ownerUserId: (r.owner_user_id as string | null) ?? null,
    department: (r.department as string | null) ?? null, model: r.model as string, entity: r.legal_entity_id as string, startup: Number(r.startup_score), app: Number(r.app_score), crashes: Number(r.crashes), risk: r.risk as string }));
}

/** The answers to the latest pulse sent by `today`, with what a group can be read by (never who). */
export async function latestPulse(tx: Tx, entities: string[], today: string) {
  const [p] = await tx.execute(sql`select id, question, sent_on::text as sent_on, recipients from experience.pulse where sent_on <= ${today}::date order by sent_on desc limit 1`);
  if (!p) return null;
  const answers = await tx.execute(sql`select choice, department, legal_entity_id from experience.pulse_answer where pulse_id = ${p.id} and legal_entity_id = any(${uuids(entities)}::uuid[])`);
  return { id: p.id as string, question: p.question as string, sentOn: p.sent_on as string, recipients: Number(p.recipients),
    answers: answers.map((a) => ({ choice: a.choice as Choice, department: (a.department as string | null) ?? null, entity: (a.legal_entity_id as string | null) ?? null })) };
}

export async function scoring(tx: Tx, reader: Reader, dimension: Dimension) {
  const today = await todayOf(tx);
  const entities = await entitiesOf(tx, reader);
  const ids = entities.map((e) => e.id);
  const site = (id: string | null) => { const e = entities.find((x) => x.id === id); return e ? SITE[e.country] ?? e.name : "Unknown"; };
  const keyOf = { department: (d: string | null) => d ?? "No department", site, model: (m: string) => m };
  const latest = await latestReadings(tx, ids, today);
  const pulse = await latestPulse(tx, ids, today);
  const readings: Reading[] = latest.map((l) => ({ device: l.deviceId, person: l.person, startup: l.startup, app: l.app, key: dimension === "department" ? keyOf.department(l.department) : dimension === "site" ? site(l.entity) : l.model }));
  const answers: Answer[] = (pulse?.answers ?? []).map((a) => ({ choice: a.choice, key: dimension === "department" ? keyOf.department(a.department) : dimension === "site" ? site(a.entity) : null }));
  const [all] = await tx.execute(sql`select count(*)::int as n from core.legal_entity`);
  return { today, entities, latest, readings, pulse, full: ids.length > 0 && ids.length === Number(all.n), ...groupsOf(readings, answers) };
}

/** Each group's score on the latest snapshot at least 28 days before today. */
export async function baseline(tx: Tx, dimension: Dimension, today: string) {
  const rows = await tx.execute(sql`select distinct on (group_key) group_key, score::float as score from experience.score_snapshot
    where dimension = ${dimension} and day <= ${addDays(today, -28)}::date order by group_key, day desc`);
  return new Map(rows.map((r) => [r.group_key as string, Number(r.score)]));
}

export async function groupScores(tx: Tx, reader: Reader, dimension: Dimension): Promise<GroupScore[]> {
  const s = await scoring(tx, reader, dimension);
  return s.groups.map((g) => ({ dimension, group: g.label, members: g.members, people: g.people, score: g.score, device: g.device, app: g.app, pulse: g.pulse }));
}

export async function dropsOf(tx: Tx, reader: Reader): Promise<ScoreDrop[]> {
  const out: ScoreDrop[] = [];
  for (const dimension of ["department", "site"] as const) {
    const s = await scoring(tx, reader, dimension);
    if (!s.full) continue;
    const before = await baseline(tx, dimension, s.today);
    for (const g of s.groups) {
      const from = before.get(g.key);
      if (from !== undefined && Math.round(from * 10) - Math.round(g.score * 10) >= 10)
        out.push({ dimension, group: g.label, from, to: g.score, asOf: s.today, source: { label: `Digital experience by ${dimension}`, evidenceRef: `/experience?by=${dimension}` } });
    }
  }
  return out;
}

export async function mine(tx: Tx, userId: string): Promise<MyExperience> {
  const today = await todayOf(tx);
  const rows = await tx.execute(sql`select distinct on (r.device_id) d.model, r.startup_score, r.app_score, r.risk from experience.device_day r join experience.device d on d.id = r.device_id
    where d.owner_user_id = ${userId} and r.day <= ${today}::date order by r.device_id, r.day desc`);
  const devices = rows.map((r) => ({ model: r.model as string, device: round1(Number(r.startup_score) / 10), app: round1(Number(r.app_score) / 10), risk: r.risk as string }));
  return { score: devices.length ? partsOf(rows.map((r) => ({ key: "me", person: userId, startup: Number(r.startup_score), app: Number(r.app_score) })), []).score : null, devices };
}
