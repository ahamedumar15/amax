import { sql } from "drizzle-orm";
import type { Tx } from "@amax/db";
import { privacyRules, statutoryMinimums, type Rule } from "./catalog";

export type Entity = { id: string; name: string; country: string };
export type Override = { rule: string; entityId: string | null; period: string };
export type Periods = { entities: Entity[]; overrides: Override[] };
export type Effective = { period: string; statutory: { period: string; reason: string } | null; override: boolean };

const UNIT_DAYS: Record<string, number> = { Y: 365.25, M: 30.44, W: 7, D: 1 };

export function days(period: string) {
  return [...period.matchAll(/(\d+)([YMWD])/g)].reduce((n, m) => n + Number(m[1]) * UNIT_DAYS[m[2]], 0);
}

export const longest = (periods: string[]) => periods.reduce((a, b) => (days(b) > days(a) ? b : a));

export async function loadPeriods(tx: Tx): Promise<Periods> {
  const entities = await tx.execute(sql`select id::text, name, country from core.legal_entity order by name`);
  const overrides = await tx.execute(sql`select rule, legal_entity_id::text as entity_id, period from privacy.retention_period`);
  return {
    entities: entities.map((e) => ({ id: e.id as string, name: e.name as string, country: String(e.country).trim() })),
    overrides: overrides.map((o) => ({ rule: o.rule as string, entityId: (o.entity_id as string | null) ?? null, period: o.period as string })),
  };
}

export function statutoryFor(rule: Pick<Rule, "class">, country: string | null) {
  const hits = statutoryMinimums().filter((s) => s.class === rule.class && (country === null || s.country === country));
  if (!hits.length) return null;
  const top = hits.reduce((a, b) => (days(b.period) > days(a.period) ? b : a));
  return { period: top.period, reason: top.reason };
}

export function effective(p: Periods, rule: Rule, entityId: string | null): Effective {
  const own = p.overrides.find((o) => o.rule === rule.id && o.entityId === entityId) ?? p.overrides.find((o) => o.rule === rule.id && o.entityId === null);
  const country = p.entities.find((e) => e.id === entityId)?.country ?? null;
  const statutory = statutoryFor(rule, country);
  const base = own?.period ?? rule.period;
  return { period: statutory ? longest([base, statutory.period]) : base, statutory, override: !!own };
}

export function widest(p: Periods, rule: Rule) {
  const ids: (string | null)[] = p.entities.length ? p.entities.map((e) => e.id) : [null];
  return longest(ids.map((id) => effective(p, rule, id).period));
}

export const findRule = (id: string) => privacyRules().find((r) => r.id === id || r.label?.toLowerCase() === id.trim().toLowerCase());
