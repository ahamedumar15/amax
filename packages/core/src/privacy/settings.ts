import { sql } from "drizzle-orm";
import { z } from "zod";
import { defineService } from "../service";
import { PRIVACY_MANAGE } from "./catalog";
import { days, effective, findRule, loadPeriods, statutoryFor } from "./periods";
import { PrivacyError } from "./subjects";

const Period = z.string().regex(/^P(\d+Y)?(\d+M)?(\d+W)?(\d+D)?$/).refine((p) => days(p) >= 1, "must be at least a day");

export const setRetentionPeriod = defineService({
  name: "privacy.period.set",
  action: PRIVACY_MANAGE,
  resource: "privacy.retention_period",
  input: z.object({ rule: z.string().min(1).max(200), entityId: z.uuid().nullable().default(null), period: Period }),
  async run(tx, input, ctx) {
    const rule = findRule(input.rule);
    if (!rule) throw new PrivacyError(`no retention rule "${input.rule}"`);
    const p = await loadPeriods(tx);
    const entity = input.entityId ? p.entities.find((e) => e.id === input.entityId) : null;
    if (input.entityId && !entity) throw new PrivacyError(`no legal entity ${input.entityId}`);
    const floors = (entity ? [entity.country] : p.entities.map((e) => e.country)).map((c) => statutoryFor(rule, c)).filter((s) => s !== null);
    if (rule.minimum && days(input.period) < days(rule.minimum)) throw new PrivacyError(`${rule.label ?? rule.id} can't be kept for less than ${rule.minimum}: it is kept for security, not for a person`);
    const floor = floors.find((s) => days(input.period) < days(s.period));
    if (floor) throw new PrivacyError(`${rule.label ?? rule.id} can't be kept for less than ${floor.period}: ${floor.reason}`);
    const before = { period: effective(p, rule, input.entityId).period };
    await tx.execute(sql`delete from privacy.retention_period where rule = ${rule.id} and legal_entity_id is not distinct from ${input.entityId}`);
    const [row] = await tx.execute(sql`insert into privacy.retention_period (tenant_id, rule, legal_entity_id, period, set_by)
      values (${ctx.tenantId}, ${rule.id}, ${input.entityId}, ${input.period}, ${ctx.actor.id}) returning id`);
    const after = { rule: rule.id, entityId: input.entityId, period: input.period };
    return { result: after, resourceId: row.id as string, before, after, events: [{ name: "privacy.period.set", payload: after }] };
  },
});
