import { sql, type SQL } from "drizzle-orm";
import { textArray } from "@amax/db";
import { effective, widest, type Periods } from "./periods";
import type { Rule } from "./catalog";

export const tableOf = (rule: Pick<Rule, "table">) => {
  const [schema, table] = rule.table.split(".");
  return sql`${sql.identifier(schema)}.${sql.identifier(table)}`;
};

export function about(rule: Rule, ids: string[]): SQL {
  const list = textArray(ids);
  const one = (c: string) => sql`(${sql.identifier(c)}::text = any(${list}) or split_part(${sql.identifier(c)}::text, ' for ', 2) = any(${list}))`;
  return sql.join((rule.subject ?? []).map(one), sql` or `);
}

function periodOf(p: Periods, rule: Rule): SQL {
  if (!rule.entity || !p.entities.length) return sql`${widest(p, rule)}::interval`;
  const col = sql.identifier(rule.entity);
  const arms = p.entities.map((e) => sql`when ${e.id} then ${effective(p, rule, e.id).period}`);
  return sql`(case ${col}::text ${sql.join(arms, sql` `)} else ${widest(p, rule)} end)::interval`;
}

export function due(p: Periods, rule: Rule): SQL {
  const period = periodOf(p, rule);
  const at = rule.start.at.length ? sql`least(${sql.join(rule.start.at.map((c) => sql.identifier(c)), sql`, `)}) < now() - ${period}` : sql`false`;
  const idle = rule.start.idle ? sql`updated_at < now() - ${rule.start.idle}::interval - ${period}` : sql`false`;
  return sql`(${at} or ${idle})`;
}

export const paused = (rule: Rule, held: string[]) => held.length > 0 && !rule.subject?.length;

export const notHeld = (rule: Rule, held: string[]): SQL => (held.length && rule.subject?.length ? sql`not (${about(rule, held)})` : sql`true`);
