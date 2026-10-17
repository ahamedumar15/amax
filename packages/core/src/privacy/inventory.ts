import { sql } from "drizzle-orm";
import { textArray, type Tx } from "@amax/db";
import { countRule } from "./apply";
import { privacyRules, type Rule } from "./catalog";
import { about, searchable as findable, type Match } from "./match";
import { statutoryFor } from "./periods";
import { PrivacyError, resolveSubject, type Subject } from "./subjects";

export type Item = { source: string; label: string; class: string; n: number; action: Rule["action"] | "erase"; rule?: string; kept?: string; unchecked?: string };

export const V1_KEPT = "kept: pre-2026-10-17 audit format. Its hash covers the raw values, so erasing them would break the audit chain";
const AI_KEPT = "kept: append-only AI usage ledger. It holds no content, only an id that no longer names anyone once the rest is erased";
const ACCOUNT_KEPT = "kept: the sign-in account. Remove it in your identity provider; SCIM deactivates it here";

const searchable = (r: Rule) => findable(r) && r.module !== "privacy";

export const matchOf = (s: Pick<Subject, "ids" | "label">, names: string[] = []): Match => ({ ids: s.ids, names: [...new Set([s.label, ...names])] });

async function ruleItems(tx: Tx, s: Subject, names: string[]): Promise<Item[]> {
  const out: Item[] = [];
  for (const rule of privacyRules().filter(searchable)) {
    // A rule that can't be counted is "could not check", never 0 (review 058 B3): dropping it would
    // let a request complete as erased while that table still holds the person's data.
    const n = await tx.transaction((sp) => countRule(sp, rule, about(rule, matchOf(s, names)))).catch((e: unknown) => (e instanceof Error ? e : new Error(String(e))));
    if (n instanceof Error) {
      out.push({ source: rule.table, rule: rule.id, label: rule.label ?? rule.table, class: rule.class, n: 0, action: rule.action, unchecked: `could not check: ${n.message.split("\n")[0].slice(0, 200)}` });
      continue;
    }
    if (!n) continue;
    const law = statutoryFor(rule, s.country);
    const kept = law ? `kept: statutory minimum, ${law.period.slice(1).toLowerCase()} (${law.reason})` : undefined;
    out.push({ source: rule.table, rule: rule.id, label: rule.label ?? rule.table, class: rule.class, n, action: rule.action, kept });
  }
  return out;
}

async function coreItems(tx: Tx, s: Subject): Promise<Item[]> {
  const ids = textArray(s.ids);
  const [a] = await tx.execute(sql`select count(*) filter (where chain_v = 2)::int as v2, count(*) filter (where chain_v = 1)::int as v1 from core.audit_event
    where actor = any(${ids}) or on_behalf_of = any(${ids}) or resource_id = any(${ids})`);
  const [t] = await tx.execute(sql`select count(*)::int as n from core.trace_event where actor = any(${ids}) or on_behalf_of = any(${ids}) or record_id = any(${ids})`);
  const [ai] = await tx.execute(sql`select count(*)::int as n from ai.call where user_id::text = any(${ids}) or caller = any(${ids})`);
  const items: Item[] = [
    { source: "core.audit_event", label: "Audit log, identifying values", class: "personal", n: Number(a.v2), action: "erase" },
    { source: "core.audit_event", label: "Audit log, before 2026-10-17", class: "personal", n: Number(a.v1), action: "erase", kept: V1_KEPT },
    { source: "core.trace_event", label: "Trace, identifying values", class: "personal", n: Number(t.n), action: "erase" },
    { source: "ai.call", label: "AI usage ledger", class: "personal", n: Number(ai.n), action: "erase", kept: AI_KEPT },
    { source: "auth.user", label: "Sign-in account", class: "personal", n: 1, action: "erase", kept: ACCOUNT_KEPT },
  ];
  return items.filter((i) => i.n > 0);
}

export async function inventory(tx: Tx, s: Subject, names: string[] = []): Promise<Item[]> {
  return [...(await ruleItems(tx, s, names)), ...(await coreItems(tx, s))];
}

/** Refuses to act on an inventory with a rule it could not count (review 058 B3). */
export function assertChecked(items: Item[], doing: string) {
  const bad = items.filter((i) => i.unchecked);
  if (bad.length) throw new PrivacyError(`can't ${doing}: amax could not check ${bad.map((i) => i.label).join(", ")}. Fix ${bad.length === 1 ? "that rule" : "those rules"} first, so nothing is left behind`);
}

export const summarise = (items: Item[]) => ({
  unchecked: items.filter((i) => i.unchecked).length,
  kept: items.filter((i) => i.kept).reduce((n, i) => n + i.n, 0),
  toErase: items.filter((i) => !i.kept).reduce((n, i) => n + i.n, 0),
  total: items.reduce((n, i) => n + i.n, 0),
});

export async function inventoryFor(tx: Tx, person: string) {
  const subject = await resolveSubject(tx, person);
  return { subject, items: await inventory(tx, subject) };
}
