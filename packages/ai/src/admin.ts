import { sql } from "drizzle-orm";
import { type Db, textArray, withTenant } from "@amax/db";
import { z } from "zod";
import { defineService, SENSITIVITY_CLASSES } from "@amax/core/server";
import { loadPolicy, normalizeRegion, parseRegion, REGIONS, type AiPolicy } from "./policy";

export type AiStats = { calls: number; costUsd: number; unpriced: number; redactions: Record<string, number>; injections: number; failures: number };

// Figures for the AI and data screen: this calendar month (UTC).
export async function aiStats(db: Db, tenantId: string, now = new Date()): Promise<AiStats & { policy: AiPolicy }> {
  const month = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
  return withTenant(db, tenantId, async (tx) => {
    const [s] = await tx.execute(sql`select count(*)::int as calls, coalesce(sum(cost_usd), 0)::float as cost, count(*) filter (where cost_usd is null)::int as unpriced, count(*) filter (where injection_suspected)::int as injections,
      count(*) filter (where not ok)::int as failures from ai.call where at >= ${month}`);
    const red = await tx.execute(sql`select key, sum(value::int)::int as n from ai.call, jsonb_each_text(redactions) where at >= ${month} group by key`);
    return {
      calls: Number(s.calls), costUsd: Number(s.cost), unpriced: Number(s.unpriced), injections: Number(s.injections), failures: Number(s.failures),
      redactions: Object.fromEntries(red.map((r) => [r.key as string, Number(r.n)])), policy: await loadPolicy(tx),
    };
  });
}

// A closed list (REGIONS, by code or name), checked when the model proposes the change, so an
// unknown region is refused on the card instead of stored and shown as valid (052 review).
const region = z.string().nullable().optional()
  .refine((v) => v == null || parseRegion(v) !== undefined, { message: `use one of ${Object.keys(REGIONS).join(", ")}` });

/** What may change; anything left out keeps its current value. */
export const policyPatch = z.object({
  allowedClasses: z.array(z.enum(SENSITIVITY_CLASSES)).optional(),
  zdrConfirmed: z.boolean().optional(),
  voiceEnabled: z.boolean().optional(),
  enabled: z.boolean().optional(),
  dataRegion: region,
  providerRegion: region,
  aiRegion: region,
  dbRegion: region,
  storageRegion: region,
}).strict();
export type PolicyPatch = z.infer<typeof policyPatch>;

const merged = (p: AiPolicy, x: PolicyPatch) => ({
  allowedClasses: x.allowedClasses ?? p.allowedClasses, zdrConfirmed: x.zdrConfirmed ?? p.zdrConfirmed, voiceEnabled: x.voiceEnabled ?? p.voiceEnabled, enabled: x.enabled ?? p.enabled,
  dataRegion: normalizeRegion(x.dataRegion === undefined ? p.dataRegion : x.dataRegion), providerRegion: x.providerRegion === undefined ? p.providerRegion : normalizeRegion(x.providerRegion),
  aiRegion: normalizeRegion(x.aiRegion === undefined ? p.regions.ai : x.aiRegion), dbRegion: normalizeRegion(x.dbRegion === undefined ? p.regions.database : x.dbRegion),
  storageRegion: normalizeRegion(x.storageRegion === undefined ? p.regions.storage : x.storageRegion),
});

// Admin only (the permission is Admin's alone). Each change bumps the policy version, is audited
// with who did it (or the agent acting for them) and announced as ai.policy.updated (047 AC-3).
export const setAiPolicy = defineService({
  name: "ai.policy.update",
  action: "ai:policy:manage",
  resource: "ai.settings",
  input: policyPatch,
  async run(tx, patch, ctx) {
    const before = await loadPolicy(tx);
    const next = merged(before, patch);
    await tx.execute(sql`insert into ai.settings (tenant_id, policy_version, enabled, allowed_classes, zdr_confirmed, voice_enabled, data_region, provider_region, ai_region, db_region, storage_region)
      values (${ctx.tenantId}, ${before.version + 1}, ${next.enabled}, ${textArray(next.allowedClasses)}, ${next.zdrConfirmed}, ${next.voiceEnabled}, ${next.dataRegion}, ${next.providerRegion}, ${next.aiRegion}, ${next.dbRegion}, ${next.storageRegion})
      on conflict (tenant_id) do update set enabled = excluded.enabled, allowed_classes = excluded.allowed_classes, zdr_confirmed = excluded.zdr_confirmed,
        voice_enabled = excluded.voice_enabled, data_region = excluded.data_region, provider_region = excluded.provider_region, ai_region = excluded.ai_region,
        db_region = excluded.db_region, storage_region = excluded.storage_region, policy_version = ai.settings.policy_version + 1, updated_at = now()`);
    const after = { ...next, version: before.version + 1 };
    return { result: after, resourceId: ctx.tenantId, before: { ...before }, after, events: [{ name: "ai.policy.updated", payload: { version: after.version } }] };
  },
});
