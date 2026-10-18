import { sql } from "drizzle-orm";
import { z } from "zod";
import type { Tx } from "@amax/db";
import { defineService } from "@amax/core/server";
import { getPerson, personIdsForUser } from "@amax/hr/contracts";
import { EVENTS, type CollectionCompleted } from "../contracts";
import type { Snapshot } from "./graph";
import { findIssues } from "./issues";
import { COLLECT, todayOf } from "./read";
import { snapshotScores } from "./snapshot";

const Reading = z.object({ externalId: z.string(), upn: z.string().nullable(), model: z.string().max(120), startupScore: z.number().int().min(0).max(100), bootSeconds: z.number().int().min(0),
  appScore: z.number().int().min(0).max(100), crashes: z.number().int().min(0), hangs: z.number().int().min(0), batteryPct: z.number().int().min(0).max(100).nullable(), risk: z.enum(["none", "low", "medium", "high"]) });
const App = z.object({ externalId: z.string(), app: z.string().max(120), version: z.string().max(40), crashes: z.number().int().min(0), hangs: z.number().int().min(0) });

/** A device's owner by the UPN matched to a signed-in user, their person in hr, and that person's entity and department. */
async function ownerOf(tx: Tx, ctx: Parameters<typeof getPerson>[1], upn: string | null) {
  if (!upn) return null;
  const [u] = await tx.execute(sql`select id from auth.user where lower(email) = lower(${upn})`);
  if (!u) return null;
  const [pid] = await personIdsForUser(tx, u.id as string);
  const p = pid ? await getPerson(tx, ctx, pid) : null;
  return p ? { userId: u.id as string, personId: p.id, entity: p.legalEntityId, department: p.department } : null;
}

/** AC-1, AC-2: stores the allowed fields of devices whose owner is in an entity where collection is on. */
async function store(tx: Tx, tenantId: string, ctx: Parameters<typeof getPerson>[1], s: Snapshot, entities: string[], today: string) {
  let kept = 0;
  for (const d of s.devices) {
    const o = await ownerOf(tx, ctx, d.upn);
    if (!o || !entities.includes(o.entity)) continue;
    const [dev] = await tx.execute(sql`insert into experience.device (tenant_id, external_id, model, owner_user_id, person_id, legal_entity_id, department) values (${tenantId}, ${d.externalId}, ${d.model}, ${o.userId}, ${o.personId}, ${o.entity}, ${o.department})
      on conflict (tenant_id, external_id) do update set model = excluded.model, owner_user_id = excluded.owner_user_id, person_id = excluded.person_id, legal_entity_id = excluded.legal_entity_id, department = excluded.department, last_seen_at = now() returning id`);
    await tx.execute(sql`insert into experience.device_day (tenant_id, device_id, owner_user_id, day, startup_score, boot_seconds, app_score, crashes, hangs, battery_pct, risk)
      values (${tenantId}, ${dev.id}, ${o.userId}, ${today}, ${d.startupScore}, ${d.bootSeconds}, ${d.appScore}, ${d.crashes}, ${d.hangs}, ${d.batteryPct}, ${d.risk})
      on conflict (device_id, day) do update set startup_score = excluded.startup_score, boot_seconds = excluded.boot_seconds, app_score = excluded.app_score, crashes = excluded.crashes, hangs = excluded.hangs, battery_pct = excluded.battery_pct, risk = excluded.risk, collected_at = now()`);
    for (const a of s.apps.filter((x) => x.externalId === d.externalId))
      await tx.execute(sql`insert into experience.device_app_day (tenant_id, device_id, owner_user_id, day, app, app_version, crashes, hangs) values (${tenantId}, ${dev.id}, ${o.userId}, ${today}, ${a.app}, ${a.version}, ${a.crashes}, ${a.hangs})
        on conflict (device_id, day, app, app_version) do update set crashes = excluded.crashes, hangs = excluded.hangs, collected_at = now()`);
    kept++;
  }
  return kept;
}

// The collection's one write per run: only the job holds experience:collect. Without a snapshot (the
// sandbox) the readings already stored are what the fictional Intune reports.
export const recordCollection = defineService({
  name: "experience.collection.record", action: COLLECT, resource: "experience.device",
  input: z.object({ snapshot: z.object({ devices: z.array(Reading), apps: z.array(App) }).nullable(), entities: z.array(z.uuid()) }),
  async run(tx, a, ctx) {
    const today = await todayOf(tx);
    const kept = a.snapshot ? await store(tx, ctx.tenantId, ctx, a.snapshot, a.entities, today) : null;
    const found = await findIssues(tx, ctx.tenantId, today);
    const drops = await snapshotScores(tx, ctx, today);
    const payload: CollectionCompleted = { devices: kept ?? 0, entities: a.entities.length, issues: found.length };
    return { result: { ...payload, sandbox: !a.snapshot, drops: drops.length }, resourceId: null, after: payload,
      events: [{ name: EVENTS.collected, payload }, ...drops.map((d) => ({ name: EVENTS.scoreDropped, payload: d }))] };
  },
});
