import { sql } from "drizzle-orm";
import { textArray, type Tx } from "@amax/db";
import { privacyRules } from "./catalog";
import type { Item } from "./inventory";
import { about, byName, tableOf, type Match } from "./match";
import { PrivacyError } from "./subjects";

/** A row that names the person only by name, as the approver sees it before deciding (review 058). */
export type NameRow = { id: string; values: Record<string, unknown> };
export type NameRows = { rule: string; label: string; rows: NameRow[] }[];
/** The approver's decision, row by row: ids they checked and found to be this person's, or someone else's. */
export type NameDecision = { include: string[]; exclude: string[] };

const LIMIT = 500;

/** Every row found only by name for the review items, with the columns that show whose it is. */
export async function nameRows(tx: Tx, who: Match, items: Item[]): Promise<NameRows> {
  const out: NameRows = [];
  for (const item of items.filter((i) => i.review && i.rule)) {
    const rule = privacyRules().find((r) => r.id === item.rule);
    if (!rule) continue;
    // Counted first (060 AC-3): rows past the limit would never be listed or decided, so refuse instead.
    if (item.n > LIMIT) throw new PrivacyError(`${item.label} has ${item.n} rows recorded by name only, more than the ${LIMIT} one request can list for review. Correct the names in that module first, so fewer rows match`);
    const cols = [...new Set([...(rule.subjectName ?? []), ...rule.fields, ...rule.start.at])].filter((c) => c !== "id").map((c) => sql.identifier(c));
    const rows = await tx.execute(sql`select id::text as id, ${sql.join(cols, sql`, `)} from ${tableOf(rule)}
      where ${byName(rule, who)} and not coalesce(${about(rule, who)}, false) order by id`);
    out.push({ rule: rule.id, label: item.label, rows: rows.map(({ id, ...values }) => ({ id: id as string, values })) });
  }
  return out;
}

/**
 * Applies the approver's row-by-row decision to the inventory. Every row found only by name must be
 * decided, and only rows amax listed can be (review 058 round 4): a request never completes with a
 * name-only row nobody looked at, and a namesake's row is kept while the person's own is acted on.
 */
export function decideNameRows(items: Item[], found: NameRows, d: NameDecision | undefined, excluded: string): Item[] {
  if (!found.some((f) => f.rows.length)) return items;
  const listed = new Set(found.flatMap((f) => f.rows.map((r) => r.id)));
  const include = new Set(d?.include ?? []);
  const exclude = new Set(d?.exclude ?? []);
  const unknown = [...include, ...exclude].filter((id) => !listed.has(id));
  if (unknown.length) throw new PrivacyError(`${unknown.length} row id${unknown.length === 1 ? "" : "s"} in the decision aren't rows this request found by name: ${unknown.slice(0, 5).join(", ")}`);
  const both = [...include].filter((id) => exclude.has(id));
  if (both.length) throw new PrivacyError(`a row can't be both this person's and someone else's: ${both.slice(0, 5).join(", ")}`);
  const open = found.map((f) => ({ label: f.label, n: f.rows.filter((r) => !include.has(r.id) && !exclude.has(r.id)).length })).filter((f) => f.n);
  if (open.length) throw new PrivacyError(`rows recorded by name only still need a decision: ${open.map((f) => `${f.label} (${f.n})`).join(", ")}. Check them with get_privacy_request, then list each row's id as this person's (include) or someone else's (exclude)`);
  return items.flatMap((i) => {
    const f = i.review ? found.find((x) => x.rule === i.rule) : undefined;
    if (!f) return [i];
    const mine = f.rows.filter((r) => include.has(r.id)).map((r) => r.id);
    const theirs = f.rows.filter((r) => exclude.has(r.id)).map((r) => r.id);
    const base = { ...i, review: undefined };
    return [
      ...(mine.length ? [{ ...base, n: mine.length, rows: mine }] : []),
      ...(theirs.length ? [{ ...base, n: theirs.length, kept: excluded, rows: theirs }] : []),
    ];
  });
}

/** The rows of an item the approver included, as a condition on the rule's table. */
export const includedRows = (rows: string[]) => sql`id::text = any(${textArray(rows)})`;
