import { sql } from "drizzle-orm";
import { z } from "zod";
import type { Tx } from "@amax/db";
import { defineService, type ServiceContext, type ServiceOutcome } from "@amax/core/server";
import { EVENTS, type Hired, type OfferSent } from "../contracts";
import { providerOf, signProviders } from "../sign";
import { mayAct } from "./guard";
import { actorOf, dayOf, lockApplication } from "./read";

const SEND = "recruitment:offer:send";
const providerIds = () => signProviders().map((p) => p.id) as [string, ...string[]];

// 023 AC-3: an offer goes out for e-signature through the provider adapter; only the envelope id is kept.
export const sendOffer = defineService({
  scoped: true,
  name: "recruitment.offer.send",
  action: SEND,
  resource: "recruitment.offer",
  input: z.object({
    applicationId: z.uuid(), startsOn: z.iso.date().describe("The first working day, e.g. 2026-11-02"),
    provider: z.string().default("zoho-sign").refine((p) => providerIds().includes(p), "no such e-signature provider").describe("zoho-sign, or demo (fictional, sends nothing)"),
  }),
  async run(tx, input, ctx) {
    const a = await lockApplication(tx, input.applicationId);
    mayAct(ctx, SEND, a.legal_entity_id as string);
    if (a.stage !== "interview") throw new Error("an offer follows the interviews");
    const p = providerOf(input.provider);
    if (!p.fictional && !a.email) throw new Error("the candidate has no email to sign with");
    const [o] = await tx.execute(sql`insert into recruitment.offer (tenant_id, application_id, legal_entity_id, provider, envelope_id, starts_on, sent_by)
      values (${ctx.tenantId}, ${a.id}, ${a.legal_entity_id}, ${p.id}, 'pending', ${input.startsOn}, ${actorOf(ctx)}) returning id`);
    const envelopeId = await p.send(ctx, { offerId: o.id as string, title: `Offer: ${a.role_title as string}`, signer: { name: a.name as string, email: (a.email as string | null) ?? "" },
      fields: { role: a.role_title as string, department: a.department as string, starts_on: input.startsOn } });
    await tx.execute(sql`update recruitment.offer set envelope_id = ${envelopeId} where id = ${o.id}`);
    await tx.execute(sql`update recruitment.application set stage = 'offer', offered_at = now(), moved_by = ${actorOf(ctx)} where id = ${a.id}`);
    const payload: OfferSent = { applicationId: a.id as string, offerId: o.id as string, legalEntityId: a.legal_entity_id as string, provider: p.id, by: actorOf(ctx) };
    return { result: { offerId: o.id as string, provider: p.label, envelopeId, status: "sent" }, resourceId: o.id as string, after: { provider: p.id, startsOn: input.startsOn }, events: [{ name: EVENTS.offerSent, payload }] };
  },
});

/** A signed offer hires: the application closes as hired, and the role is filled once every opening is. */
async function hire(tx: Tx, ctx: ServiceContext, a: Record<string, unknown>, offer: Record<string, unknown>) {
  const by = actorOf(ctx);
  await tx.execute(sql`update recruitment.offer set status = 'signed', signed_at = now() where id = ${offer.id}`);
  await tx.execute(sql`update recruitment.application set stage = 'hired', hired_at = now(), moved_by = ${by} where id = ${a.id}`);
  await tx.execute(sql`update recruitment.candidate set decided_at = now() where id = ${a.candidate_id}`);
  await tx.execute(sql`update recruitment.role r set status = 'filled', closed_at = now() where r.id = ${a.role_id}
    and r.openings <= (select count(*) from recruitment.application x where x.role_id = r.id and x.stage = 'hired')`);
  const payload: Hired = { applicationId: a.id as string, roleId: a.role_id as string, legalEntityId: a.legal_entity_id as string, startsOn: dayOf(offer.starts_on)!, by };
  return payload;
}

export const checkOffer = defineService({
  scoped: true,
  name: "recruitment.offer.check",
  action: SEND,
  resource: "recruitment.offer",
  input: z.object({ offerId: z.uuid() }),
  async run(tx, { offerId }, ctx): Promise<ServiceOutcome<{ offerId: string; status: string; hired?: boolean; startsOn?: string }>> {
    const [o] = await tx.execute(sql`select * from recruitment.offer where id = ${offerId} for update`);
    if (!o) throw new Error("no such offer");
    mayAct(ctx, SEND, o.legal_entity_id as string);
    if (o.status !== "sent") return { result: { offerId, status: o.status as string }, resourceId: offerId };
    const status = await providerOf(o.provider as string).status(ctx, o.envelope_id as string);
    const a = await lockApplication(tx, o.application_id as string);
    if (status === "sent") return { result: { offerId, status }, resourceId: offerId };
    if (status === "declined") {
      await tx.execute(sql`update recruitment.offer set status = 'declined' where id = ${offerId}`);
      await tx.execute(sql`update recruitment.application set stage = 'withdrawn', closed_at = now(), close_note = 'Declined the offer', moved_by = ${actorOf(ctx)} where id = ${a.id}`);
      return { result: { offerId, status }, resourceId: offerId, before: { status: "sent" }, after: { status } };
    }
    const hired = await hire(tx, ctx, a, o);
    return { result: { offerId, status, hired: true, startsOn: hired.startsOn }, resourceId: offerId, before: { status: "sent" }, after: { status, stage: "hired" }, events: [{ name: EVENTS.hired, payload: hired }] };
  },
});
