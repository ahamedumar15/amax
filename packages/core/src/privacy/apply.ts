import { sql, type SQL } from "drizzle-orm";
import type { Tx } from "@amax/db";
import type { Rule } from "./catalog";
import { tableOf } from "./match";

const TEXT = new Set(["text", "character varying", "character"]);
const NUMBER = new Set(["numeric", "integer", "bigint", "smallint", "real", "double precision"]);
const NIL_UUID = "00000000-0000-0000-0000-000000000000";

export const ANONYMISED = "Anonymised";

function placeholder(type: string, nullable: boolean): SQL {
  if (nullable) return sql`null`;
  if (TEXT.has(type)) return sql`${ANONYMISED}`;
  if (NUMBER.has(type)) return sql`0`;
  if (type === "jsonb" || type === "json") return sql`'{}'::jsonb`;
  if (type === "uuid") return sql`${NIL_UUID}::uuid`;
  return sql`null`;
}

async function assignments(tx: Tx, rule: Rule) {
  const [schema, table] = rule.table.split(".");
  const cols = await tx.execute(sql`select column_name, data_type, is_nullable from information_schema.columns where table_schema = ${schema} and table_name = ${table}`);
  return rule.fields.map((f) => {
    const c = cols.find((x) => x.column_name === f);
    if (!c) throw new Error(`retention: ${rule.table} has no column ${f}`);
    return { col: sql.identifier(f), value: placeholder(c.data_type as string, c.is_nullable === "YES") };
  });
}

export async function applyRule(tx: Tx, rule: Rule, where: SQL): Promise<number> {
  if (rule.action === "delete") return (await tx.execute(sql`delete from ${tableOf(rule)} where ${where} returning 1`)).length;
  const set = await assignments(tx, rule);
  const changed = sql.join(set.map((s) => sql`${s.col} is distinct from ${s.value}`), sql` or `);
  const assign = sql.join(set.map((s) => sql`${s.col} = ${s.value}`), sql`, `);
  return (await tx.execute(sql`update ${tableOf(rule)} set ${assign} where ${where} and (${changed}) returning 1`)).length;
}

export async function countRule(tx: Tx, rule: Rule, where: SQL): Promise<number> {
  const [r] = await tx.execute(sql`select count(*)::int as n from ${tableOf(rule)} where ${where}`);
  return Number(r?.n ?? 0);
}
