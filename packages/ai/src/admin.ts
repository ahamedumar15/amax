import { sql } from "drizzle-orm";
import { withTenant, type Db } from "@amax/db";
import { appendAudit } from "@amax/core/server";
import { loadPolicy, type AiPolicy } from "./policy";

export type AiStats = { calls: number; costUsd: number; redactions: Record<string, number>; injections: number; failures: number };

// Figures for the AI and data screen: this calendar month (UTC).
export async function aiStats(db: Db, tenantId: string, now = new Date()): Promise<AiStats & { policy: AiPolicy }> {
  const month = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
  return withTenant(db, tenantId, async (tx) => {
    const [s] = await tx.execute(sql`select count(*)::int as calls, coalesce(sum(cost_usd), 0)::float as cost, count(*) filter (where injection_suspected)::int as injections,
      count(*) filter (where not ok)::int as failures from ai.call where at >= ${month}`);
    const red = await tx.execute(sql`select key, sum(value::int)::int as n from ai.call, jsonb_each_text(redactions) where at >= ${month} group by key`);
    return {
      calls: Number(s.calls), costUsd: Number(s.cost), injections: Number(s.injections), failures: Number(s.failures),
      redactions: Object.fromEntries(red.map((r) => [r.key as string, Number(r.n)])), policy: await loadPolicy(tx),
    };
  });
}

export type PolicyPatch = { allowedClasses: string[]; zdrConfirmed: boolean; voiceEnabled: boolean; enabled: boolean; dataRegion: string | null; providerRegion: string | null; aiRegion: string | null; dbRegion: string | null; storageRegion: string | null };

// Admin only (the caller checks). Each change bumps the policy version and is audited.
export async function savePolicy(db: Db, tenantId: string, actorId: string, patch: PolicyPatch) {
  await withTenant(db, tenantId, async (tx) => {
    const before = await loadPolicy(tx);
    await tx.execute(sql`insert into ai.settings (tenant_id, policy_version, enabled, allowed_classes, zdr_confirmed, voice_enabled, data_region, provider_region, ai_region, db_region, storage_region)
      values (${tenantId}, ${before.version + 1}, ${patch.enabled}, ${`{${patch.allowedClasses.join(",")}}`}::text[], ${patch.zdrConfirmed}, ${patch.voiceEnabled}, ${patch.dataRegion}, ${patch.providerRegion}, ${patch.aiRegion}, ${patch.dbRegion}, ${patch.storageRegion})
      on conflict (tenant_id) do update set enabled = excluded.enabled, allowed_classes = excluded.allowed_classes, zdr_confirmed = excluded.zdr_confirmed,
        voice_enabled = excluded.voice_enabled, data_region = excluded.data_region, provider_region = excluded.provider_region, ai_region = excluded.ai_region,
        db_region = excluded.db_region, storage_region = excluded.storage_region, policy_version = ai.settings.policy_version + 1, updated_at = now()`);
    await appendAudit(tx, { tenantId, actor: { id: actorId, kind: "user" }, source: "ui" }, { action: "ai.policy.update", resource: "ai.settings", resourceId: tenantId, before, after: patch });
  });
}
