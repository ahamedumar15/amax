import { sql } from "drizzle-orm";
import type { Tx } from "@amax/db";

export type AiPolicy = {
  enabled: boolean;
  provider: string;
  providerRegion: string | null;
  zdrRequired: boolean;
  zdrConfirmed: boolean;
  allowedClasses: string[];
  voiceEnabled: boolean;
  voiceService: string;
  dataRegion: string | null;
  regions: { database: string | null; storage: string | null; ai: string | null };
  version: number;
};

export const DEFAULT_POLICY: AiPolicy = {
  enabled: true, provider: "anthropic", providerRegion: null, zdrRequired: true, zdrConfirmed: false, allowedClasses: [],
  voiceEnabled: false, voiceService: "browser", dataRegion: null, regions: { database: null, storage: null, ai: null }, version: 1,
};

export async function loadPolicy(tx: Tx): Promise<AiPolicy> {
  const [r] = await tx.execute(sql`select * from ai.settings`);
  if (!r) return DEFAULT_POLICY;
  return {
    enabled: Boolean(r.enabled), provider: r.provider as string, providerRegion: (r.provider_region as string | null) ?? null,
    zdrRequired: Boolean(r.zdr_required), zdrConfirmed: Boolean(r.zdr_confirmed), allowedClasses: (r.allowed_classes as string[]) ?? [],
    voiceEnabled: Boolean(r.voice_enabled), voiceService: r.voice_service as string, dataRegion: (r.data_region as string | null) ?? null,
    regions: { database: (r.db_region as string | null) ?? null, storage: (r.storage_region as string | null) ?? null, ai: (r.ai_region as string | null) ?? null },
    version: Number(r.policy_version),
  };
}

/** Why AI is off for this tenant, or null when it may run (AC-4: data outside the region blocks it). */
export function blockedReason(p: AiPolicy): string | null {
  if (!p.enabled) return "AI is switched off for this organisation";
  if (p.zdrRequired && !p.zdrConfirmed) return "zero data retention is required but an Admin hasn't confirmed it with the provider";
  if (p.dataRegion) {
    const outside = Object.entries(p.regions).filter(([, r]) => r && r !== p.dataRegion).map(([k]) => k);
    if (outside.length) return `${outside.join(", ")} ${outside.length > 1 ? "are" : "is"} outside the data region (${p.dataRegion})`;
  }
  return null;
}
