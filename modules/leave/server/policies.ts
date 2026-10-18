import { sql } from "drizzle-orm";
import { z } from "zod";
import type { Tx } from "@amax/db";
import { assertCan, viewerOf } from "@amax/auth";
import { defineService } from "@amax/core/server";
import { packFor } from "../packs";

/** Installs a country pack's leave types for one legal entity, and its holidays for the country. Safe to re-run. */
export async function installPack(tx: Tx, tenantId: string, entity: { id: string; country: string }) {
  const pack = packFor(entity.country);
  if (!pack) throw new Error(`no leave country pack for ${entity.country} yet (there are packs for Sri Lanka and Australia)`);
  for (const p of pack.policies) {
    await tx.execute(sql`insert into leave.policy (tenant_id, legal_entity_id, type, label, days_per_year, paid, half_days, pack, rule)
      values (${tenantId}, ${entity.id}, ${p.type}, ${p.label}, ${p.daysPerYear}, ${p.paid}, ${p.halfDays}, ${pack.country}, ${p.rule ?? null})
      on conflict (tenant_id, legal_entity_id, type) do update set label = excluded.label, days_per_year = excluded.days_per_year, paid = excluded.paid,
        half_days = excluded.half_days, pack = excluded.pack, rule = excluded.rule`);
  }
  for (const h of pack.holidays) {
    await tx.execute(sql`insert into leave.holiday (tenant_id, country, on_date, name, kind) values (${tenantId}, ${pack.country}, ${h.on}, ${h.name}, ${h.kind}) on conflict do nothing`);
  }
  return { pack: pack.name, policies: pack.policies.map((p) => p.label), holidays: pack.holidays.length };
}

export const applyCountryPack = defineService({
  scoped: true, name: "leave.policy.apply_pack", action: "leave:admin", resource: "leave.policy",
  input: z.object({ entity: z.string().min(1).describe("Legal entity name or id") }),
  async run(tx, a, ctx) {
    const [e] = await tx.execute(sql`select id, name, country from core.legal_entity where id::text = ${a.entity} or lower(name) = lower(${a.entity})`);
    if (!e) throw new Error(`no legal entity ${a.entity}`);
    const v = viewerOf(ctx);
    if (v) assertCan(v, "leave:admin", { legalEntityId: e.id as string });
    const done = await installPack(tx, ctx.tenantId, { id: e.id as string, country: String(e.country) });
    return { result: { entity: e.name as string, ...done }, resourceId: e.id as string, after: { country: String(e.country) } };
  },
});
