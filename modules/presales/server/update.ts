import { sql } from "drizzle-orm";
import { z } from "zod";
import { defineService } from "@amax/core/server";
import { lockOpenOpportunity, NUMBER, ownerLink, toUsd } from "./common";
import { newOpportunity } from "./opportunities";

const COLUMNS = {
  title: "title", ownerName: "owner_name", leadName: "lead_name", service: "service", costCentre: "cost_centre", estimateDays: "estimate_days",
  expectedClose: "expected_close", leadSource: "lead_source", competing: "competing", nextStep: "next_step",
} as const;
type Field = keyof typeof COLUMNS;

export const opportunityChanges = newOpportunity.pick({
  title: true, value: true, currency: true, ownerName: true, leadName: true, service: true, costCentre: true, estimateDays: true,
  expectedClose: true, leadSource: true, competing: true, nextStep: true,
}).partial().extend({ number: z.string().regex(NUMBER), currency: newOpportunity.shape.currency.removeDefault().optional() });

export const updateOpportunity = defineService({
  name: "presales.opportunity.update",
  action: "presales:opportunity:edit",
  resource: "presales.opportunity",
  input: opportunityChanges,
  async run(tx, input, ctx) {
    const o = await lockOpenOpportunity(tx, input.number);
    // Saying the current owner again changes nothing, so it keeps the owner's user link (057).
    const same = input.ownerName !== undefined && input.ownerName.trim() === String(o.owner_name ?? "").trim();
    const fields = (Object.keys(COLUMNS) as Field[]).filter((f) => input[f] !== undefined && !(f === "ownerName" && same));
    const sets = fields.map((f) => sql`${sql.identifier(COLUMNS[f])} = ${input[f]!}`);
    const money = input.value !== undefined || input.currency !== undefined;
    if (money) {
      const value = input.value ?? Number(o.value_amount), currency = input.currency ?? (o.value_currency as string);
      const { rate, usd } = await toUsd(tx, value, currency);
      sets.push(sql`value_amount = ${value}`, sql`value_currency = ${currency}`, sql`usd_rate = ${rate}`, sql`value_usd = ${usd}`);
    }
    if (!sets.length) throw new Error(`say what to change on ${input.number}`);
    const owner = input.ownerName !== undefined && !same ? ownerLink(ctx, input.ownerName) : undefined;
    if (owner !== undefined) sets.push(sql`owner_user_id = ${owner}`);
    await tx.execute(sql`update presales.opportunity set ${sql.join(sets, sql`, `)}, updated_at = now() where id = ${o.id}`);
    const before = Object.fromEntries([...fields.map((f) => [f, o[COLUMNS[f]]]), ...(money ? [["value", o.value_amount], ["currency", o.value_currency]] : []),
      ...(owner !== undefined ? [["ownerUserId", o.owner_user_id]] : [])]);
    const { number: _, ...rest } = input;
    const after = { ...Object.fromEntries(Object.entries(rest).filter(([k]) => !(k === "ownerName" && same))), ...(owner !== undefined ? { ownerUserId: owner } : {}) };
    const note = owner === null ? `${input.ownerName} isn't linked to a user account; the owner is recorded by name only` : undefined;
    return { result: { number: input.number, changed: Object.keys(after).filter((k) => k !== "ownerUserId"), ...(owner !== undefined ? { ownerLinked: owner !== null } : {}), ...(note ? { note } : {}) },
      resourceId: o.id as string, before, after };
  },
});
