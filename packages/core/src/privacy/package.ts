import { sql, type SQL } from "drizzle-orm";
import { textArray, type Tx } from "@amax/db";
import { privacyRules } from "./catalog";
import { EXCLUDED_BY_APPROVER, type Item } from "./inventory";
import { about, tableOf, type Match } from "./match";
import { includedRows } from "./name-rows";
import { PrivacyError } from "./subjects";

export const PACKAGE_LIMIT = 5000;

/** Counts first, so a section is never cut short without saying so (060 AC-3). */
async function fits(tx: Tx, label: string, from: SQL) {
  const [{ n }] = await tx.execute(sql`select count(*)::int as n from ${from}`);
  if (Number(n) > PACKAGE_LIMIT) throw new PrivacyError(`${label} has ${n} rows, more than the ${PACKAGE_LIMIT} one access package holds. Nothing was sent; export it in parts with the data export instead`);
}

export async function buildPackage(tx: Tx, label: string, who: Match, items: Item[]) {
  const ids = who.ids;
  const sections = [];
  // Rows found by name only are in the package only once the approver included them (review 058).
  for (const item of items.filter((i) => i.rule && !i.review && !i.unchecked && i.kept !== EXCLUDED_BY_APPROVER)) {
    const rule = privacyRules().find((r) => r.id === item.rule)!;
    const cols = [...new Set([...rule.fields, ...rule.start.at])].map((c) => sql.identifier(c));
    const from = sql`${tableOf(rule)} where ${item.rows ? includedRows(item.rows) : about(rule, who)}`;
    await fits(tx, item.label, from);
    const rows = await tx.execute(sql`select ${sql.join(cols, sql`, `)} from ${from}`);
    sections.push({ label: item.label, table: rule.table, rows });
  }
  const list = textArray(ids);
  const trail = sql`core.audit_event where actor = any(${list}) or on_behalf_of = any(${list}) or resource_id = any(${list})`;
  await fits(tx, "The audit log", trail);
  const audit = await tx.execute(sql`select occurred_at as at, action, resource, source from ${trail} order by seq`);
  return { person: label, generatedAt: new Date().toISOString(), sections, audit };
}
