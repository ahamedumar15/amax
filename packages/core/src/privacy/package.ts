import { sql } from "drizzle-orm";
import { textArray, type Tx } from "@amax/db";
import { privacyRules } from "./catalog";
import type { Item } from "./inventory";
import { about, tableOf } from "./match";

export async function buildPackage(tx: Tx, label: string, ids: string[], items: Item[]) {
  const sections = [];
  for (const item of items.filter((i) => i.rule)) {
    const rule = privacyRules().find((r) => r.id === item.rule)!;
    const cols = [...new Set([...rule.fields, ...rule.start.at])].map((c) => sql.identifier(c));
    const rows = await tx.execute(sql`select ${sql.join(cols, sql`, `)} from ${tableOf(rule)} where ${about(rule, ids)} limit 5000`);
    sections.push({ label: item.label, table: rule.table, rows });
  }
  const list = textArray(ids);
  const audit = await tx.execute(sql`select occurred_at as at, action, resource, source from core.audit_event
    where actor = any(${list}) or on_behalf_of = any(${list}) or resource_id = any(${list}) order by seq limit 5000`);
  return { person: label, generatedAt: new Date().toISOString(), sections, audit };
}
