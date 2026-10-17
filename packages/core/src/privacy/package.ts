import { sql } from "drizzle-orm";
import { textArray, type Tx } from "@amax/db";
import { privacyRules } from "./catalog";
import { EXCLUDED_BY_APPROVER, type Item } from "./inventory";
import { about, tableOf, type Match } from "./match";
import { includedRows } from "./name-rows";

export async function buildPackage(tx: Tx, label: string, who: Match, items: Item[]) {
  const ids = who.ids;
  const sections = [];
  // Rows found by name only are in the package only once the approver included them (review 058).
  for (const item of items.filter((i) => i.rule && !i.review && !i.unchecked && i.kept !== EXCLUDED_BY_APPROVER)) {
    const rule = privacyRules().find((r) => r.id === item.rule)!;
    const cols = [...new Set([...rule.fields, ...rule.start.at])].map((c) => sql.identifier(c));
    const rows = await tx.execute(sql`select ${sql.join(cols, sql`, `)} from ${tableOf(rule)} where ${item.rows ? includedRows(item.rows) : about(rule, who)} limit 5000`);
    sections.push({ label: item.label, table: rule.table, rows });
  }
  const list = textArray(ids);
  const audit = await tx.execute(sql`select occurred_at as at, action, resource, source from core.audit_event
    where actor = any(${list}) or on_behalf_of = any(${list}) or resource_id = any(${list}) order by seq limit 5000`);
  return { person: label, generatedAt: new Date().toISOString(), sections, audit };
}
