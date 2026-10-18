import { sql } from "drizzle-orm";
import { z } from "zod";
import type { Tx } from "@amax/db";
import { contextFor, defineService } from "@amax/core/server";
import { getPerson, listPeople, personIdsForUser } from "@amax/hr/contracts";
import { CHOICES, EVENTS, PULSE_EVERY_DAYS, type PulseSent } from "../contracts";
import { addDays, ANSWER, by, personOf, PULSE, todayOf } from "./read";

const people = (tenantId: string) => contextFor.job(tenantId, "experience.pulse");
const onEntities = async (tx: Tx) => (await tx.execute(sql`select legal_entity_id from experience.collection where enabled`)).map((r) => r.legal_entity_id as string);

// AC-4: one question at most a fortnight, to the people of the entities where collection is on.
// 030 delivers each `experience.pulse.sent` on the person's own channels (Teams when they chose it).
export const sendPulse = defineService({
  name: "experience.pulse.send", action: PULSE, resource: "experience.pulse",
  input: z.object({ question: z.string().trim().min(5).max(200).default("How well do your laptop and apps work for you?") }),
  async run(tx, a, ctx) {
    const today = await todayOf(tx);
    const [last] = await tx.execute(sql`select sent_on::text as sent_on from experience.pulse order by sent_on desc limit 1`);
    if (last && (last.sent_on as string) > addDays(today, -PULSE_EVERY_DAYS)) throw new Error(`a pulse went out on ${last.sent_on as string}; the next can go after ${addDays(last.sent_on as string, PULSE_EVERY_DAYS)}`);
    const entities = await onEntities(tx);
    const to = (await listPeople(tx, people(ctx.tenantId), { status: ["active"] })).filter((p) => p.userId && entities.includes(p.legalEntityId));
    const [p] = await tx.execute(sql`insert into experience.pulse (tenant_id, question, sent_on, sent_by, recipients) values (${ctx.tenantId}, ${a.question}, ${today}, ${by(ctx)}, ${to.length}) returning id`);
    const events = to.map((x) => ({ name: EVENTS.pulseSent, payload: { pulseId: p.id as string, userId: x.userId!, question: a.question } satisfies PulseSent }));
    return { result: { pulseId: p.id as string, recipients: to.length }, resourceId: p.id as string, after: { sentOn: today, recipients: to.length }, events };
  },
});

// AC-4: the receipt (who) and the answer (what, with only the department and entity) are separate
// rows; the audit and the result say only which pulse was answered.
export const answerPulse = defineService({
  name: "experience.pulse.answer", action: ANSWER, resource: "experience.pulse_answer",
  input: z.object({ pulseId: z.uuid(), choice: z.enum(CHOICES).describe("well, sometimes or a-lot") }),
  async run(tx, a, ctx) {
    const userId = personOf(ctx);
    if (!userId) throw new Error("only the person asked can answer a pulse");
    const today = await todayOf(tx);
    const [p] = await tx.execute(sql`select id from experience.pulse where id = ${a.pulseId} and sent_on > ${addDays(today, -PULSE_EVERY_DAYS)}::date`);
    if (!p) throw new Error("that pulse is closed");
    const [r] = await tx.execute(sql`insert into experience.pulse_receipt (tenant_id, pulse_id, user_id) values (${ctx.tenantId}, ${a.pulseId}, ${userId}) on conflict do nothing returning user_id`);
    if (!r) throw new Error("you've already answered this pulse");
    const [id] = await personIdsForUser(tx, userId);
    const person = id ? await getPerson(tx, people(ctx.tenantId), id) : null;
    await tx.execute(sql`insert into experience.pulse_answer (tenant_id, pulse_id, choice, department, legal_entity_id) values (${ctx.tenantId}, ${a.pulseId}, ${a.choice}, ${person?.department ?? null}, ${person?.legalEntityId ?? null})`);
    return { result: { answered: true }, resourceId: a.pulseId, after: { pulseId: a.pulseId } };
  },
});
