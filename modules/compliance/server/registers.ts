import { sql } from "drizzle-orm";
import type { Tx } from "@amax/db";
import { breachRuleFor } from "../packs";
import { day, iso, type Row } from "./context";

export type Incident = {
  id: string; ref: string; title: string; description: string | null; occurredOn: string; country: string | null; ownerName: string | null;
  personalData: boolean; dataClass: string | null; impact: string | null; breach: boolean; notifyBy: string | null; rule: string | null; regulator: string | null;
  decision: string | null; notifiedOn: string | null; status: string; resolvedOn: string | null; reportedBy: string;
};
export type Risk = {
  id: string; ref: string; title: string; description: string | null; likelihood: number; impact: number; score: number; level: string;
  ownerName: string | null; treatment: string | null; status: string; reviewOn: string | null;
};

export const toIncident = (r: Row): Incident => ({
  id: r.id as string, ref: r.ref as string, title: r.title as string, description: (r.description as string | null) ?? null, occurredOn: day(r.occurred_on)!,
  country: (r.country as string | null) ?? null, ownerName: (r.owner_name as string | null) ?? null, personalData: Boolean(r.personal_data), dataClass: (r.data_class as string | null) ?? null,
  impact: (r.impact as string | null) ?? null, breach: Boolean(r.breach), notifyBy: iso(r.notify_by), rule: (r.pack_rule as string | null) ?? null,
  regulator: r.breach ? breachRuleFor(r.country as string | null).regulator : null, decision: (r.decision as string | null) ?? null, notifiedOn: day(r.notified_on),
  status: r.status as string, resolvedOn: day(r.resolved_on), reportedBy: r.reported_by as string,
});

export const toRisk = (r: Row): Risk => ({
  id: r.id as string, ref: r.ref as string, title: r.title as string, description: (r.description as string | null) ?? null, likelihood: Number(r.likelihood), impact: Number(r.impact),
  score: Number(r.likelihood) * Number(r.impact), level: r.level as string, ownerName: (r.owner_name as string | null) ?? null, treatment: (r.treatment as string | null) ?? null,
  status: r.status as string, reviewOn: day(r.review_on),
});

/** Undecided possible breaches first (soonest deadline), then open incidents, then the rest, newest first. */
export const incidents = async (tx: Tx) => (await tx.execute(sql`select * from compliance.incident
  order by (breach and decision is null and status <> 'resolved') desc, notify_by nulls last, (status = 'resolved'), occurred_on desc`)).map(toIncident);

/** Open risks, highest score first. */
export const openRisks = async (tx: Tx) => (await tx.execute(sql`select * from compliance.risk where status <> 'closed' order by likelihood * impact desc, ref`)).map(toRisk);

export const byId = async <T>(tx: Tx, table: "incident" | "risk" | "supplier" | "evidence_bundle" | "policy", id: string, map: (r: Row) => T): Promise<T | null> => {
  const [r] = await tx.execute(sql`select * from ${sql.raw(`compliance.${table}`)} where id::text = ${id}`);
  return r ? map(r) : null;
};
