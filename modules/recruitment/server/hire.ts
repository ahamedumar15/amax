import { sql } from "drizzle-orm";
import { z } from "zod";
import type { EventHandlerDef } from "@amax/core";
import { contextFor } from "@amax/core/server";
import { defineSuggestionKind } from "@amax/agents";
import { createSuggestion, SuggestionError } from "@amax/agents/server";
import { EVENTS as HR, getPerson, type PersonJoined } from "@amax/hr/contracts";
import { EVENTS, type HireConfirmed, type Hired } from "../contracts";
import { actorOf, dayOf, lockApplication } from "./read";

// 023 AC-1: a hire becomes an HR record only when HR says so. `recruitment.hired` makes a 006
// suggestion that only someone with hr:person:create can accept; accepting confirms the hire for HR
// records, and chat then adds the person with hr's own add_person tool. When hr reports the person
// joined (hr.person.joined), the hire is linked to them, read through the HR contract.
const HrRecord = z.object({ applicationId: z.uuid(), name: z.string(), title: z.string(), department: z.string(), legalEntityId: z.uuid(), joinedOn: z.string() });
type HrRecord = z.infer<typeof HrRecord>;

export const hrRecord = defineSuggestionKind<HrRecord, { at: string }>({
  kind: "recruitment.hr-record",
  title: "New hire for HR records",
  permission: "hr:person:create",
  proposed: HrRecord,
  fields: { name: "candidate" },
  async apply(tx, ctx, p) {
    const a = await lockApplication(tx, p.applicationId);
    if (a.stage !== "hired") throw new SuggestionError("that application isn't a hire any more");
    const by = actorOf(ctx);
    await tx.execute(sql`update recruitment.application set hr_confirmed_by = ${by}, hr_confirmed_at = now() where id = ${p.applicationId}`);
    const payload: HireConfirmed = { applicationId: p.applicationId, roleId: a.role_id as string, legalEntityId: p.legalEntityId, startsOn: p.joinedOn, by: a.moved_by as string, confirmedBy: by };
    return { applied: { at: new Date().toISOString() }, action: "recruitment.hire.confirm", resource: "recruitment.application", resourceId: p.applicationId, before: { hrConfirmed: false }, after: { hrConfirmed: true },
      events: [{ name: EVENTS.hireConfirmed, payload }] };
  },
  async undo(tx, ctx, p) {
    const a = await lockApplication(tx, p.applicationId);
    if (a.person_id) throw new SuggestionError("HR has added the person already; change their HR record instead");
    await tx.execute(sql`update recruitment.application set hr_confirmed_by = null, hr_confirmed_at = null where id = ${p.applicationId}`);
    return { applied: null, action: "recruitment.hire.unconfirm", resource: "recruitment.application", resourceId: p.applicationId, before: { hrConfirmed: true }, after: { hrConfirmed: false, by: actorOf(ctx) } };
  },
});

export const hireAgent: EventHandlerDef = {
  id: "recruitment.hire-agent",
  event: EVENTS.hired,
  async handle({ tx, tenantId, event }) {
    const e = event.payload as Hired;
    const [a] = await tx.execute(sql`select a.id, r.title, r.department, c.name from recruitment.application a join recruitment.role r on r.id = a.role_id
      join recruitment.candidate c on c.id = a.candidate_id where a.id = ${e.applicationId} and a.person_id is null`);
    if (!a) return;
    await createSuggestion(contextFor.job(tenantId, "recruitment.hire-agent"), {
      kind: hrRecord.kind, target: { type: "recruitment.application", id: e.applicationId, label: `New ${a.title as string}, starts ${e.startsOn}` },
      title: `Add the new ${a.title as string} to HR records`, detail: `The offer is signed and they start on ${e.startsOn}. Accept to confirm the hire for HR, then add them with HR's add_person.`,
      proposed: { applicationId: e.applicationId, name: a.name, title: a.title, department: a.department, legalEntityId: e.legalEntityId, joinedOn: e.startsOn },
      confidence: 1, agentName: "Hiring agent", scope: { legalEntityId: e.legalEntityId }, evidence: [{ type: "record", label: "Signed offer", ref: `/recruitment?application=${e.applicationId}` }],
    });
  },
};

/** hr says someone joined: link the confirmed hire with the same name, entity and start day to them. */
export const joinedLink: EventHandlerDef = {
  id: "recruitment.hr-joined",
  event: HR.personJoined,
  async handle({ tx, tenantId, event }) {
    const e = event.payload as PersonJoined;
    const p = await getPerson(tx, contextFor.job(tenantId, "recruitment.hr-joined"), e.personId);
    if (!p) return;
    await tx.execute(sql`update recruitment.application a set person_id = ${p.id} from recruitment.candidate c, recruitment.offer o
      where c.id = a.candidate_id and o.application_id = a.id and o.status = 'signed' and a.stage = 'hired' and a.person_id is null
        and a.legal_entity_id = ${p.legalEntityId} and lower(c.name) = lower(${p.name}) and o.starts_on = ${dayOf(e.joinedOn)}`);
  },
};
