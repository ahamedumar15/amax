// The only import surface for other modules (docs/module-standard.md). Reads run in the caller's
// tenant transaction; events are what presales emits through the outbox.
import { sql } from "drizzle-orm";
import type { Tx } from "@amax/db";
import type { Money } from "@amax/core";
import { LIVE, OPPORTUNITY } from "./server/sql";

export const STAGES = ["new-idea", "lead", "qualified", "proposal", "negotiation", "won", "lost"] as const;
export type Stage = (typeof STAGES)[number];
export const OPEN_STAGES = STAGES.slice(0, 5) as readonly Stage[];
export type Health = "green" | "amber" | "red";

export type OpportunityRef = {
  id: string; number: string; title: string; client: string; stage: Stage; winChance: number;
  value: Money; valueUsd: Money; health: Health; projectId: string | null; projectKey: string | null;
};

/** Every stage move and win-chance change; `reason` is set when it was lost. */
export type OpportunityStageChanged = { opportunityId: string; number: string; from: Stage; to: Stage; fromChance: number; toChance: number; by: string; reason: string | null };
/** A won opportunity became a delivery project. */
export type OpportunityPromoted = {
  opportunityId: string; number: string; projectId: string; projectKey: string; by: string;
  client: string; costCentre: string | null; estimateDays: number | null; ownerName: string | null; leadName: string | null; valueUsd: Money;
};

export const EVENTS = { stageChanged: "presales.opportunity.stage_changed", promoted: "presales.opportunity.promoted" } as const;

export const numberOf = (n: number) => `PS-${String(n).padStart(4, "0")}`;

const toRef = (r: Record<string, unknown>): OpportunityRef => ({
  id: r.id as string, number: numberOf(Number(r.number)), title: r.title as string, client: r.client_name as string, stage: r.stage as Stage,
  winChance: Number(r.win_chance), value: { amount: String(r.value_amount), currency: (r.value_currency as string).trim() },
  valueUsd: { amount: String(r.value_usd), currency: "USD" }, health: r.health as Health,
  projectId: (r.project_id as string | null) ?? null, projectKey: (r.project_key as string | null) ?? null,
});

/** Opportunities in this tenant, newest first; `open` keeps only those still in play. */
export async function listOpportunityRefs(tx: Tx, opts: { open?: boolean } = {}): Promise<OpportunityRef[]> {
  const open = opts.open ? sql`and o.stage not in ('won', 'lost')` : sql``;
  return (await tx.execute(sql`${OPPORTUNITY} where ${LIVE} ${open} order by o.number desc`)).map(toRef);
}

export async function getOpportunityRef(tx: Tx, idOrNumber: string): Promise<OpportunityRef | null> {
  const n = /^PS-(\d+)$/.exec(idOrNumber)?.[1];
  const [r] = await tx.execute(n ? sql`${OPPORTUNITY} where o.number = ${Number(n)} and ${LIVE}` : sql`${OPPORTUNITY} where o.id::text = ${idOrNumber} and ${LIVE}`);
  return r ? toRef(r) : null;
}

/** The open pipeline in USD: total, weighted by win chance, and how many opportunities. */
export async function pipelineTotals(tx: Tx): Promise<{ open: Money; weighted: Money; count: number }> {
  const [r] = await tx.execute(sql`select coalesce(sum(value_usd), 0)::numeric(19,4)::text as total,
      coalesce(sum(value_usd * win_chance / 100.0), 0)::numeric(19,4)::text as weighted, count(*)::int as n
    from presales.opportunity o where ${LIVE} and o.stage not in ('won', 'lost')`);
  return { open: { amount: r.total as string, currency: "USD" }, weighted: { amount: r.weighted as string, currency: "USD" }, count: Number(r.n) };
}
