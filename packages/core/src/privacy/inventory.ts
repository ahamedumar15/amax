import { sql } from "drizzle-orm";
import { textArray, type Tx } from "@amax/db";
import { countRule } from "./apply";
import { privacyRules, type Rule } from "./catalog";
import { about } from "./match";
import { statutoryFor } from "./periods";
import type { Subject } from "./subjects";

export type Item = { source: string; label: string; class: string; n: number; action: Rule["action"] | "erase"; rule?: string; kept?: string };

export const V1_KEPT = "kept: pre-2026-10-17 audit format. Its hash covers the raw values, so erasing them would break the audit chain";
const AI_KEPT = "kept: append-only AI usage ledger. It holds no content, only an id that no longer names anyone once the rest is erased";
const ACCOUNT_KEPT = "kept: the sign-in account. Remove it in your identity provider; SCIM deactivates it here";

const searchable = (r: Rule) => !!r.subject?.length && r.module !== "privacy";

async function ruleItems(tx: Tx, s: Subject): Promise<Item[]> {
  const out: Item[] = [];
  for (const rule of privacyRules().filter(searchable)) {
    const n = await tx.transaction((sp) => countRule(sp, rule, about(rule, s.ids))).catch(() => 0);
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

export async function inventory(tx: Tx, s: Subject): Promise<Item[]> {
  return [...(await ruleItems(tx, s)), ...(await coreItems(tx, s))];
}

export const summarise = (items: Item[]) => ({
  kept: items.filter((i) => i.kept).reduce((n, i) => n + i.n, 0),
  toErase: items.filter((i) => !i.kept).reduce((n, i) => n + i.n, 0),
  total: items.reduce((n, i) => n + i.n, 0),
});
