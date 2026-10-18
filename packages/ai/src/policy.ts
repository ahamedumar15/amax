import { sql } from "drizzle-orm";
import type { Tx } from "@amax/db";
import { aiEndpoint, type AiEndpoint } from "./endpoint";

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

/** Data regions are a closed list of codes, so "Australia", "au" and "AU" can't disagree. */
export const REGIONS = { AU: "Australia", LK: "Sri Lanka", US: "United States", EU: "European Union", UK: "United Kingdom", SG: "Singapore", IN: "India", CA: "Canada" } as const;
export type RegionCode = keyof typeof REGIONS;

/** A region code for a code or name, null when empty, undefined when not recognised. */
export function parseRegion(input: string | null | undefined): RegionCode | null | undefined {
  const v = (input ?? "").trim();
  if (!v) return null;
  const code = v.toUpperCase();
  if (code in REGIONS) return code as RegionCode;
  return (Object.entries(REGIONS) as [RegionCode, string][]).find(([, name]) => name.toLowerCase() === v.toLowerCase())?.[0];
}

/** For input from the screen: an unrecognised region is refused. */
export function normalizeRegion(input: string | null | undefined): RegionCode | null {
  const r = parseRegion(input);
  if (r === undefined) throw new Error(`unknown region "${(input ?? "").trim()}"; use one of ${Object.keys(REGIONS).join(", ")}`);
  return r;
}

/**
 * Why AI is off for this tenant, or null when it may run (AC-4). With a data region set, every
 * place data goes must be known and inside it: an unknown region blocks, it doesn't pass. That
 * includes the endpoint calls really go to (044 AC-3), checked against the configuration, not the
 * Admin's declaration.
 */
export function blockedReason(p: AiPolicy, endpoint: AiEndpoint = aiEndpoint()): string | null {
  if (!p.enabled) return "AI is switched off for this organisation";
  if (p.zdrRequired && !p.zdrConfirmed) return "zero data retention is required but an Admin hasn't confirmed it with the provider";
  if (p.dataRegion) {
    // Stored values may predate the closed list: one that isn't recognised blocks, it never throws,
    // so the Admin can still open the screen and fix it (review round 2).
    const data = parseRegion(p.dataRegion);
    if (!data) return `the data region "${p.dataRegion}" isn't recognised; choose one from the list`;
    const entries = Object.entries(p.regions) as [string, string | null][];
    const unknown = entries.filter(([, r]) => !r).map(([k]) => k);
    if (unknown.length) return `the data region is ${data}, but where ${unknown.join(", ")} ${unknown.length > 1 ? "run isn't" : "runs isn't"} set`;
    const unrecognised = entries.filter(([, r]) => parseRegion(r) === undefined).map(([k, r]) => `${k} ("${r}")`);
    if (unrecognised.length) return `the region for ${unrecognised.join(", ")} isn't recognised; choose one from the list`;
    const outside = entries.filter(([, r]) => parseRegion(r) !== data).map(([k]) => k);
    if (outside.length) return `${outside.join(", ")} ${outside.length > 1 ? "are" : "is"} outside the data region (${data})`;
    const served = parseRegion(endpoint.region);
    if (!served) return `the AI endpoint's region isn't configured on the server (AMAX_AI_ENDPOINT_REGION), so calls may leave ${data}`;
    if (served !== data) return `the AI endpoint is configured in ${served}, outside the data region (${data})`;
  }
  return null;
}

/**
 * Voice uses the browser's speech recognition, which in Chrome sends audio to Google's cloud.
 * So it follows the same gate as AI, and can't run under a data-region policy, because where
 * that service processes audio isn't known (review round 1).
 */
export function voiceAllowed(p: AiPolicy): { ok: true } | { ok: false; reason: string } {
  if (!p.voiceEnabled) return { ok: false, reason: "voice input is switched off" };
  const blocked = blockedReason(p);
  if (blocked) return { ok: false, reason: blocked };
  if (p.dataRegion) return { ok: false, reason: "the browser's speech service can't be kept inside the data region" };
  return { ok: true };
}
