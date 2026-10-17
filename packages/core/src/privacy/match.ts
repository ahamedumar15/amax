import { sql, type SQL } from "drizzle-orm";
import { textArray } from "@amax/db";
import { effective, widest, type Periods } from "./periods";
import type { Rule } from "./catalog";

export const tableOf = (rule: Pick<Rule, "table">) => {
  const [schema, table] = rule.table.split(".");
  return sql`${sql.identifier(schema)}.${sql.identifier(table)}`;
};

/** Who a request or hold is about: the ids modules know the person by, and the names that free-text
 * columns (an owner_name with no id beside it) record them under. */
export type Match = { ids: string[]; names: string[] };

/** True when legal holds and access and erasure requests can find this rule's rows (review 058 B1). */
export const searchable = (rule: Pick<Rule, "subject" | "subjectName">) => !!(rule.subject?.length || rule.subjectName?.length);

export function about(rule: Rule, m: Match): SQL {
  const list = textArray(m.ids);
  const names = textArray(m.names.map((n) => n.trim().toLowerCase()).filter(Boolean));
  const one = (c: string) => sql`(${sql.identifier(c)}::text = any(${list}) or split_part(${sql.identifier(c)}::text, ' for ', 2) = any(${list}))`;
  const named = (c: string) => sql`lower(trim(${sql.identifier(c)}::text)) = any(${names})`;
  const arms = [...(rule.subject ?? []).map(one), ...(rule.subjectName ?? []).map(named)];
  return arms.length ? sql`(${sql.join(arms, sql` or `)})` : sql`false`;
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

const anyone = (held: Match) => held.ids.length + held.names.length > 0;

export const paused = (rule: Rule, held: Match) => anyone(held) && !searchable(rule);

export const notHeld = (rule: Rule, held: Match): SQL => (anyone(held) && searchable(rule) ? sql`not coalesce(${about(rule, held)}, false)` : sql`true`);
