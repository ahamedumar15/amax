import { sql } from "drizzle-orm";
import type { Tx } from "@amax/db";
import { viewerOf } from "@amax/auth";
import type { Emitted, ServiceContext } from "@amax/core/server";
import { EVENTS, numberOf, type OpportunityStageChanged, type Stage } from "../contracts";

export const actorOf = (ctx: ServiceContext) => (ctx.onBehalfOf ? `${ctx.actor.id} for ${ctx.onBehalfOf}` : ctx.actor.id);
export const nameOf = (ctx: ServiceContext) => viewerOf(ctx)?.name ?? actorOf(ctx);

/**
 * The account manager's user link for an owner name (057). Presales can't look people up, so it links
 * only the one person it knows: the acting user, when the name is theirs (or no name is given). Any
 * other name is free text with no link, and the write says so (`ownerLinked: false`).
 */
export function ownerLink(ctx: ServiceContext, ownerName: string | undefined): string | null {
  const v = viewerOf(ctx);
  if (!v?.userId) return null;
  return ownerName === undefined || ownerName.trim().toLowerCase() === (v.name ?? "").trim().toLowerCase() ? v.userId : null;
}

export const NUMBER = /^PS-\d{1,6}$/;

/** Loads a live opportunity by number (PS-0142) and locks it: every write to one serialises on its row. */
export async function lockOpportunity(tx: Tx, number: string) {
  const n = Number(/^PS-(\d+)$/.exec(number)?.[1] ?? NaN);
  const [o] = Number.isFinite(n) ? await tx.execute(sql`select * from presales.opportunity where number = ${n} and removed_at is null for update`) : [];
  if (!o) throw new Error(`no opportunity ${number}`);
  return o;
}

/** As lockOpportunity, for writes that only make sense while the deal is still in play. */
export async function lockOpenOpportunity(tx: Tx, number: string) {
  const o = await lockOpportunity(tx, number);
  if (o.stage === "won" || o.stage === "lost") throw new Error(`${number} is ${o.stage}; its records are closed`);
  return o;
}

/** Converts to USD at the tenant's rate, keeping the original amount and currency alongside. */
export async function toUsd(tx: Tx, amount: number, currency: string) {
  if (currency === "USD") return { rate: "1", usd: amount.toFixed(4) };
  const [r] = await tx.execute(sql`select usd_rate::text as rate, round(${amount}::numeric * usd_rate, 4)::text as usd from presales.fx_rate where currency = ${currency}`);
  if (!r) throw new Error(`no USD rate for ${currency}; add one before using it`);
  return { rate: r.rate as string, usd: r.usd as string };
}

/** Appends one stage-history row (who and when) and returns the matching event. */
export async function logChange(tx: Tx, ctx: ServiceContext, o: Record<string, unknown>, to: Stage, toChance: number, note: string | null, reason: string | null = null): Promise<Emitted> {
  const from = o.stage as Stage | null;
  await tx.execute(sql`insert into presales.stage_change (tenant_id, opportunity_id, from_stage, to_stage, from_chance, to_chance, note, by_name, by_actor)
    values (${ctx.tenantId}, ${o.id}, ${from}, ${to}, ${o.win_chance ?? null}, ${toChance}, ${note}, ${nameOf(ctx)}, ${actorOf(ctx)})`);
  const payload: OpportunityStageChanged = { opportunityId: o.id as string, number: numberOf(Number(o.number)), from: (from ?? to), to, fromChance: Number(o.win_chance ?? toChance), toChance, by: actorOf(ctx), reason };
  return { name: EVENTS.stageChanged, payload };
}
