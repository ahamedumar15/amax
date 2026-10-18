import { z } from "zod";
import type { EventHandlerDef } from "@amax/core";
import { contextFor, defineService } from "@amax/core/server";
import { getPerson } from "@amax/hr/contracts";
import { EVENTS as ONBOARDING, type ChecklistStarted } from "@amax/onboarding/contracts";
import { EVENTS } from "../contracts";
import { installed } from "./names";
import { TRIAGE } from "./read";
import { writeTicket } from "./tickets";

const JOB = "helpdesk.onboarding";
const day = (iso: string) => new Date(`${iso.slice(0, 10)}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

/** The joiner's laptop ticket, once per checklist; the requester is their manager when hr knows one. */
export const openJoinerTicket = defineService({
  name: "helpdesk.ticket.onboarding", action: TRIAGE, resource: "helpdesk.ticket",
  input: z.object({ checklistId: z.uuid(), startsOn: z.string().min(10), requester: z.uuid().nullable() }),
  async run(tx, a, ctx) {
    const t = await writeTicket(tx, { ctx, queue: "it", channel: "chat", requester: a.requester, title: `Laptop for new joiner, ${day(a.startsOn)}`, body: null, category: "Hardware",
      priority: "normal", sourceLink: null, note: "Created by onboarding checklist", origin: "onboarding", originRef: a.checklistId });
    return { result: { id: t?.id ?? null }, resourceId: t?.id ?? null, after: { checklistId: a.checklistId, created: Boolean(t) }, events: t ? [{ name: EVENTS.created, payload: t.payload }] : [] };
  },
});

// 013 (optional): a joiner's checklist opens a Hardware ticket. Without onboarding the event never comes.
export const joinerLaptop: EventHandlerDef = {
  id: "helpdesk.joiner-laptop",
  event: ONBOARDING.checklistStarted,
  async handle({ tx, tenantId, event }) {
    const e = event.payload as ChecklistStarted;
    if (e.kind !== "joiner") return;
    const ctx = contextFor.job(tenantId, JOB);
    const p = (await installed(tx, "hr.person")) ? await getPerson(tx, ctx, e.personId) : null;
    await openJoinerTicket(ctx, { checklistId: e.checklistId, startsOn: e.startsOn, requester: p?.managerUserId ?? null });
  },
};
