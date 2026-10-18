import { sql } from "drizzle-orm";
import { z } from "zod";
import type { Tx } from "@amax/db";
import { viewerOf } from "@amax/auth";
import { defineService, type ServiceContext } from "@amax/core/server";
import { DATA_CLASSES, EVENTS, INCIDENT_STATUSES, type BreachFlagged, type IncidentReported, type IncidentStatus } from "../contracts";
import { breachRuleFor, notifyBy } from "../packs";
import { by, day, entityNamed, iso, isoDate, nextRef, personNamed, type Row } from "./context";

async function entityOf(tx: Tx, ctx: ServiceContext, entity: string | undefined) {
  if (entity) return entityNamed(tx, entity);
  const [u] = await tx.execute(sql`select e.id, e.country from auth.user u join core.legal_entity e on e.id = u.legal_entity_id where u.id::text = ${viewerOf(ctx)?.userId ?? ""}`);
  return u ? { id: u.id as string, country: String(u.country) } : null;
}

const reported = (r: Row, ctx: ServiceContext): IncidentReported => ({
  incidentId: r.id as string, ref: r.ref as string, title: r.title as string, status: r.status as IncidentStatus, breach: Boolean(r.breach), ownerUserId: (r.owner_user_id as string | null) ?? null, by: by(ctx),
});
export const flagged = (r: Row): BreachFlagged => ({
  incidentId: r.id as string, ref: r.ref as string, title: r.title as string, ownerUserId: (r.owner_user_id as string | null) ?? null,
  country: (r.country as string | null) ?? null, notifyBy: iso(r.notify_by)!, regulator: breachRuleFor(r.country as string | null).regulator,
});
const shown = (r: Row) => ({ id: r.id as string, ref: r.ref as string, title: r.title as string, status: r.status as string, breach: Boolean(r.breach), notifyBy: iso(r.notify_by), rule: (r.pack_rule as string | null) ?? null });

// Anyone may report an incident. One that involves personal data is a possible breach: its decision
// deadline starts now, from the country pack of its legal entity.
export const reportIncident = defineService({
  name: "compliance.incident.report", action: "compliance:report", resource: "compliance.incident",
  input: z.object({ title: z.string().min(3), description: z.string().optional(), occurredOn: isoDate.optional(), entity: z.string().optional(), personalData: z.boolean().default(false),
    dataClass: z.enum(DATA_CLASSES).optional(), impact: z.string().optional(), owner: z.string().optional() }),
  async run(tx, a, ctx) {
    const [entity, owner] = [await entityOf(tx, ctx, a.entity), a.owner ? await personNamed(tx, a.owner) : null];
    const breach = a.personalData || !!a.dataClass, now = new Date();
    const [r] = await tx.execute(sql`insert into compliance.incident (tenant_id, ref, title, description, occurred_on, legal_entity_id, country, owner_user_id, owner_name, personal_data, data_class, impact,
        breach, aware_at, notify_by, pack_rule, status, reported_by)
      values (${ctx.tenantId}, ${await nextRef(tx, "incident", "INC")}, ${a.title}, ${a.description ?? null}, ${a.occurredOn ?? now.toISOString().slice(0, 10)}, ${entity?.id ?? null}, ${entity?.country ?? null},
        ${owner?.userId ?? null}, ${owner?.name ?? null}, ${breach}, ${a.dataClass ?? (breach ? "personal" : null)}, ${a.impact ?? null}, ${breach}, ${breach ? now.toISOString() : null},
        ${breach ? notifyBy(now, entity?.country).toISOString() : null}, ${breach ? breachRuleFor(entity?.country).rule : null}, ${breach ? "assessing" : "reported"}, ${by(ctx)}) returning *`);
    const events = [{ name: EVENTS.incidentReported, payload: reported(r, ctx) }, ...(breach ? [{ name: EVENTS.breachFlagged, payload: flagged(r) }] : [])];
    return { result: shown(r), resourceId: r.id as string, after: { ref: r.ref, breach, notifyBy: iso(r.notify_by) }, events };
  },
});

export const updateIncident = defineService({
  name: "compliance.incident.update", action: "compliance:manage", resource: "compliance.incident",
  input: z.object({ incidentId: z.string().uuid(), status: z.enum(INCIDENT_STATUSES).optional(), owner: z.string().optional(), personalData: z.boolean().optional(), dataClass: z.enum(DATA_CLASSES).optional(),
    impact: z.string().optional(), decision: z.enum(["notify", "no-notify"]).optional().describe("The breach decision: notify the regulator and the people affected, or not notifiable"), notifiedOn: isoDate.optional() }),
  async run(tx, a, ctx) {
    const [was] = await tx.execute(sql`select * from compliance.incident where id = ${a.incidentId} for update`);
    if (!was) throw new Error("no such incident");
    if (a.decision && !was.breach && !a.personalData) throw new Error("only a possible personal-data breach needs a notification decision");
    const owner = a.owner ? await personNamed(tx, a.owner) : null;
    const breach = a.personalData ?? (a.dataClass ? true : Boolean(was.breach));
    const starts = breach && !was.breach, now = new Date();
    const status = a.status ?? (was.status as string);
    const [r] = await tx.execute(sql`update compliance.incident set status = ${status}, owner_user_id = ${owner ? owner.userId : was.owner_user_id}, owner_name = ${owner ? owner.name : was.owner_name},
      personal_data = ${breach}, breach = ${breach}, data_class = ${a.dataClass ?? (breach ? was.data_class ?? "personal" : null)}, impact = ${a.impact ?? was.impact},
      aware_at = ${starts ? now.toISOString() : breach ? iso(was.aware_at) : null}, notify_by = ${starts ? notifyBy(now, was.country as string | null).toISOString() : breach ? iso(was.notify_by) : null},
      pack_rule = ${breach ? breachRuleFor(was.country as string | null).rule : null}, decision = ${a.decision ?? (breach ? was.decision : null)},
      decided_at = ${a.decision ? now.toISOString() : iso(was.decided_at)}, decided_by = ${a.decision ? by(ctx) : was.decided_by}, notified_on = ${a.notifiedOn ?? day(was.notified_on)},
      resolved_on = ${status === "resolved" ? sql`coalesce(resolved_on, current_date)` : null}, updated_at = now() where id = ${a.incidentId} returning *`);
    const changed = Object.keys(a).filter((k) => k !== "incidentId");
    const events = [{ name: EVENTS.incidentChanged, payload: { ...reported(r, ctx), changed } }, ...(starts ? [{ name: EVENTS.breachFlagged, payload: flagged(r) }] : [])];
    return { result: { ...shown(r), decision: (r.decision as string | null) ?? null }, resourceId: a.incidentId, before: { status: was.status, breach: was.breach, decision: was.decision },
      after: { status, breach, decision: r.decision }, events };
  },
});
