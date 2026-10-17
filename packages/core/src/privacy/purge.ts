import { sql } from "drizzle-orm";
import { z } from "zod";
import type { Tx } from "@amax/db";
import { logError } from "../log";
import { defineService } from "../service";
import { applyRule, countRule } from "./apply";
import { privacyRules, type Rule } from "./catalog";
import { heldIds } from "./holds";
import { due, notHeld, paused } from "./match";
import { loadPeriods } from "./periods";

export type PurgeCount = { rule: string; label: string; class: string; action: Rule["action"]; n: number };
export type PurgeOutcome = { counts: PurgeCount[]; paused: string[]; failed: string[] };

const labelOf = (r: Rule) => r.label ?? r.table;

async function visit(tx: Tx, act: (sp: Tx, rule: Rule, where: ReturnType<typeof due>) => Promise<number>): Promise<PurgeOutcome> {
  const [p, held] = await Promise.all([loadPeriods(tx), heldIds(tx)]);
  const out: PurgeOutcome = { counts: [], paused: [], failed: [] };
  for (const rule of privacyRules()) {
    if (paused(rule, held)) {
      out.paused.push(rule.id);
      continue;
    }
    const where = sql`${due(p, rule)} and ${notHeld(rule, held)}`;
    try {
      const n = await tx.transaction((sp) => act(sp, rule, where));
      out.counts.push({ rule: rule.id, label: labelOf(rule), class: rule.class, action: rule.action, n });
    } catch (e) {
      logError(`privacy.purge ${rule.id}`, e);
      out.failed.push(rule.id);
    }
  }
  return out;
}

export const previewPurge = (tx: Tx) => visit(tx, countRule);

function byClass(counts: PurgeCount[]) {
  const out: Record<string, Partial<Record<Rule["action"], number>>> = {};
  for (const c of counts.filter((x) => x.n > 0)) out[c.class] = { ...out[c.class], [c.action]: (out[c.class]?.[c.action] ?? 0) + c.n };
  return out;
}

export const purgeDue = defineService({
  name: "privacy.purge",
  action: "privacy:purge",
  resource: "privacy.retention_rule",
  input: z.object({}),
  async run(tx, _input, ctx) {
    const out = await visit(tx, applyRule);
    for (const c of out.counts.filter((x) => x.n > 0)) {
      await tx.execute(sql`insert into privacy.purge_log (tenant_id, rule, label, class, action, n) values (${ctx.tenantId}, ${c.rule}, ${c.label}, ${c.class}, ${c.action}, ${c.n})`);
    }
    const after = { byClass: byClass(out.counts), paused: out.paused.length, failed: out.failed };
    return { result: out, after, events: [{ name: "privacy.purged", payload: after }] };
  },
});
