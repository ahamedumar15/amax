import { sql } from "drizzle-orm";
import type { FixtureSeed } from "@amax/core";
import type { Tx } from "@amax/db";
import { contextFor } from "@amax/core/server";
import { listPeople, type PersonRef } from "@amax/hr/contracts";
import { CHOICES, EVENTS, type CollectionCompleted } from "../contracts";
import { groupScores } from "../server/groups";
import { findIssues } from "../server/issues";
import { addDays } from "../server/read";
import { DEPARTMENTS, NOTICE_ON, PULSE_ON, QUESTION } from "./data";
import { seedDevices, type Seeded } from "./devices";

const json = (rows: object[]) => JSON.stringify(rows);

async function devices(tx: Tx, tenantId: string, list: Seeded[], today: string) {
  await tx.execute(sql`insert into experience.device (id, tenant_id, external_id, model, owner_user_id, person_id, legal_entity_id, department, last_seen_at)
    select x.id, ${tenantId}, x.external_id, x.model, x.owner_user_id, x.person_id, x.legal_entity_id, x.department, ${today}::date + time '05:00'
    from jsonb_to_recordset(${json(list)}::jsonb) as x(id uuid, external_id text, model text, owner_user_id uuid, person_id uuid, legal_entity_id uuid, department text)`);
  await tx.execute(sql`insert into experience.device_day (tenant_id, device_id, owner_user_id, day, collected_at, startup_score, boot_seconds, app_score, crashes, hangs, battery_pct, risk)
    select ${tenantId}, x.id, x.owner_user_id, ${today}::date, ${today}::date + time '05:00', x.startup, x.boot_seconds, x.app, x.crashes, x.hangs, x.battery_pct, x.risk
    from jsonb_to_recordset(${json(list)}::jsonb) as x(id uuid, owner_user_id uuid, startup int, boot_seconds int, app int, crashes int, hangs int, battery_pct int, risk text)`);
  const apps = list.flatMap((x) => x.apps.flatMap((a) => a.days.map((day) => ({ id: x.id, owner: x.owner_user_id, day, app: a.app, version: a.app_version, crashes: a.crashes, hangs: a.hangs }))));
  await tx.execute(sql`insert into experience.device_app_day (tenant_id, device_id, owner_user_id, day, collected_at, app, app_version, crashes, hangs)
    select ${tenantId}, x.id, x.owner, x.day, x.day + time '05:00', x.app, x.version, x.crashes, x.hangs
    from jsonb_to_recordset(${json(apps)}::jsonb) as x(id uuid, owner uuid, day date, app text, version text, crashes int, hangs int)`);
}

/** The Oct 13 pulse: each department's answers, from its first people, with no receipt and no time. */
async function pulse(tx: Tx, tenantId: string, people: PersonRef[], admin: string) {
  const [p] = await tx.execute(sql`insert into experience.pulse (tenant_id, question, sent_on, sent_by, recipients) values (${tenantId}, ${QUESTION}, ${PULSE_ON}, ${admin}, ${people.length}) returning id`);
  const answers = DEPARTMENTS.flatMap((d) => {
    const who = people.filter((x) => x.department === d.name);
    return d.answers.flatMap((n, c) => Array.from({ length: n }, () => CHOICES[c])).map((choice, k) => ({ choice, department: d.name, entity: who[k % who.length].legalEntityId }));
  });
  await tx.execute(sql`insert into experience.pulse_answer (tenant_id, pulse_id, choice, department, legal_entity_id)
    select ${tenantId}, ${p.id}, x.choice, x.department, x.entity from jsonb_to_recordset(${json(answers)}::jsonb) as x(choice text, department text, entity uuid)`);
}

/** Four weeks ago: as now, except Quality (8.3) and Sales (7.1), as the mock's trends say. */
async function snapshots(tx: Tx, tenantId: string, today: string) {
  const ctx = contextFor.job(tenantId, "experience.fixtures");
  const was = new Map(DEPARTMENTS.map((d) => [d.name, d.before]));
  for (const dimension of ["department", "site", "model"] as const)
    for (const g of await groupScores(tx, ctx, dimension))
      await tx.execute(sql`insert into experience.score_snapshot (tenant_id, day, dimension, group_key, people, score) values (${tenantId}, ${addDays(today, -28)}, ${dimension},
        ${g.group === "Other" ? "other" : g.group}, ${g.people}, ${dimension === "department" ? (was.get(g.group) ?? g.score) : g.score})`);
}

// Seeds the demo's pinned day, collection on in both entities since the Sep 1 notice, every device's
// readings, the pulse, the issues and the trend baseline. Safe to re-run.
export const experienceFixtures: FixtureSeed = async ({ tx, tenantId, shared }) => {
  const [done] = await tx.execute(sql`select 1 from experience.settings`);
  if (done) return;
  const [admin] = await tx.execute(sql`select id from auth.user where email = 'sahan@lumenlabs.test'`);
  const by = admin ? `user:${admin.id as string}` : "fixtures";
  await tx.execute(sql`insert into experience.settings (tenant_id, today, sandbox) values (${tenantId}, ${shared.today}, true)`);
  for (const e of shared.entities) await tx.execute(sql`insert into experience.collection (tenant_id, legal_entity_id, notice_on, enabled, set_by) values (${tenantId}, ${e.id}, ${NOTICE_ON}, true, ${by})`);
  const people = (await listPeople(tx, contextFor.job(tenantId, "experience.fixtures"), { status: ["active"], on: shared.today })).filter((p) => p.department);
  const list = seedDevices(people, shared.today);
  await devices(tx, tenantId, list, shared.today);
  await pulse(tx, tenantId, people, by);
  await snapshots(tx, tenantId, shared.today);
  const found = await findIssues(tx, tenantId, shared.today);
  const payload: CollectionCompleted = { devices: list.length, entities: shared.entities.length, issues: found.length };
  await tx.execute(sql`insert into core.event (tenant_id, name, payload) values (${tenantId}, ${EVENTS.collected}, ${JSON.stringify(payload)}::jsonb)`);
};
