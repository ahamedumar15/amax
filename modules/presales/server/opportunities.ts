import { sql } from "drizzle-orm";
import { z } from "zod";
import type { Tx } from "@amax/db";
import { defineService, type ServiceContext } from "@amax/core/server";
import { numberOf, OPEN_STAGES, STAGES, type Stage } from "../contracts";
import { actorOf, lockOpportunity, logChange, nameOf, NUMBER, ownerLink, toUsd } from "./common";

/** The win chance a stage starts at when the mover doesn't give one. */
export const STAGE_CHANCE: Record<Stage, number> = { "new-idea": 10, lead: 20, qualified: 30, proposal: 50, negotiation: 80, won: 100, lost: 0 };

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "a date, YYYY-MM-DD");
const currency = z.string().regex(/^[A-Z]{3}$/, "a three-letter currency code, e.g. AUD");
const text = (max = 200) => z.string().trim().min(1).max(max);

export const newOpportunity = z.object({
    client: text(120), title: text(), value: z.number().nonnegative().max(1e12), currency: currency.default("USD"),
    stage: z.enum(OPEN_STAGES as [Stage, ...Stage[]]).default("new-idea"), winChance: z.number().int().min(0).max(100).optional(),
    ownerName: text(120).optional(), leadName: text(120).optional(), service: text(120).optional(), costCentre: text(120).optional(),
    estimateDays: z.number().int().nonnegative().max(100000).optional(), expectedClose: day.optional(), leadSource: text(120).optional(),
    competing: text().optional(), nextStep: z.string().trim().max(2000).optional(), note: z.string().trim().max(500).optional(),
});
export type NewOpportunity = z.infer<typeof newOpportunity>;

/** Inserts an opportunity and its first history row, inside the caller's transaction. */
export async function insertOpportunity(tx: Tx, input: NewOpportunity, ctx: ServiceContext) {
    const [client] = await tx.execute(sql`insert into presales.client (tenant_id, name) values (${ctx.tenantId}, ${input.client})
      on conflict (tenant_id, name) do update set name = excluded.name returning id`);
    const { rate, usd } = await toUsd(tx, input.value, input.currency);
    // Numbers are per tenant and gapless enough to read aloud; the lock serialises concurrent creates.
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext('presales.number'), hashtext(${ctx.tenantId}))`);
    const [{ next }] = await tx.execute(sql`select coalesce(max(number), 0) + 1 as next from presales.opportunity`);
    const chance = input.winChance ?? STAGE_CHANCE[input.stage];
    const [o] = await tx.execute(sql`insert into presales.opportunity (tenant_id, number, client_id, title, stage, win_chance, value_amount, value_currency, usd_rate, value_usd,
        owner_user_id, owner_name, lead_name, service, cost_centre, estimate_days, expected_close, lead_source, competing, next_step)
      values (${ctx.tenantId}, ${next}, ${client.id}, ${input.title}, ${input.stage}, ${chance}, ${input.value}, ${input.currency}, ${rate}, ${usd},
        ${ownerLink(ctx, input.ownerName)}, ${input.ownerName ?? nameOf(ctx)}, ${input.leadName ?? null}, ${input.service ?? null}, ${input.costCentre ?? null},
        ${input.estimateDays ?? null}, ${input.expectedClose ?? null}, ${input.leadSource ?? null}, ${input.competing ?? null}, ${input.nextStep ?? null}) returning *`);
    const event = await logChange(tx, ctx, { ...o, stage: null, win_chance: null }, input.stage, chance, input.note ?? null);
    const number = numberOf(Number(next));
    return { result: { id: o.id as string, number, valueUsd: usd }, resourceId: o.id as string, after: { number, ...input, valueUsd: usd, usdRate: rate }, events: [event] };
}

export const createOpportunity = defineService({
  name: "presales.opportunity.create",
  action: "presales:opportunity:create",
  resource: "presales.opportunity",
  input: newOpportunity,
  run: (tx, input, ctx) => insertOpportunity(tx, input, ctx),
});

// The explicit Move: every stage or win-chance change is logged with who and when. Lost needs a reason.
export const moveOpportunity = defineService({
  name: "presales.opportunity.move",
  action: "presales:opportunity:edit",
  resource: "presales.opportunity",
  input: z.object({
    number: z.string().regex(NUMBER), to: z.enum(STAGES), winChance: z.number().int().min(0).max(100).optional(),
    note: z.string().trim().max(500).optional(), reason: text().optional(), competitor: text(120).optional(),
  }).refine((i) => i.to !== "lost" || Boolean(i.reason), { message: "a lost opportunity needs a reason", path: ["reason"] }),
  async run(tx, input, ctx) {
    const o = await lockOpportunity(tx, input.number);
    if (o.stage === "won" || o.stage === "lost") throw new Error(`${input.number} is already ${o.stage}; it stays closed`);
    const chance = input.to === "won" ? 100 : input.to === "lost" ? 0 : (input.winChance ?? (input.to === o.stage ? Number(o.win_chance) : STAGE_CHANCE[input.to]));
    if (input.to === o.stage && chance === Number(o.win_chance)) return { result: { number: input.number, stage: input.to, winChance: chance, changed: false }, resourceId: o.id as string };
    const closed = input.to === "won" || input.to === "lost";
    await tx.execute(sql`update presales.opportunity set stage = ${input.to}, win_chance = ${chance}, updated_at = now(),
        stage_since = case when stage = ${input.to} then stage_since else now() end, closed_at = ${closed ? sql`now()` : null},
        lost_reason = ${input.to === "lost" ? input.reason! : null}, lost_competitor = ${input.to === "lost" ? (input.competitor ?? null) : null}
      where id = ${o.id}`);
    const event = await logChange(tx, ctx, o, input.to, chance, input.note ?? null, input.to === "lost" ? input.reason! : null);
    return {
      result: { number: input.number, stage: input.to, winChance: chance, changed: true }, resourceId: o.id as string,
      before: { stage: o.stage, winChance: o.win_chance }, after: { stage: input.to, winChance: chance, reason: input.reason ?? null, competitor: input.competitor ?? null }, events: [event],
    };
  },
});

// For duplicates and mistakes. A lost deal is marked lost instead, so it counts in win rates.
export const removeOpportunity = defineService({
  name: "presales.opportunity.remove",
  action: "presales:opportunity:remove",
  resource: "presales.opportunity",
  input: z.object({ number: z.string().regex(NUMBER) }),
  async run(tx, input, ctx) {
    const o = await lockOpportunity(tx, input.number);
    if (o.stage === "won" || o.stage === "lost") throw new Error(`${input.number} is closed and counts in win rates; it can't be removed`);
    await tx.execute(sql`update presales.opportunity set removed_at = now(), removed_by = ${actorOf(ctx)}, updated_at = now() where id = ${o.id}`);
    return { result: { number: input.number, removed: true }, resourceId: o.id as string, before: { title: o.title, stage: o.stage } };
  },
});
