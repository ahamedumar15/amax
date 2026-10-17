import { z } from "zod";
import type postgres from "postgres";
import { isRole } from "./roles";

// Config seeds only the first tenant; every later tenant is set up in the app.
const schema = z.object({
  AMAX_SEED_TENANT_NAME: z.string().min(1),
  AMAX_SEED_ENTRA_DIRECTORY_ID: z.string().min(1),
  AMAX_SEED_ENTRA_CLIENT_ID: z.string().min(1),
  /** Where the secret lives, e.g. env:AMAX_ENTRA_CLIENT_SECRET. Never the secret itself. */
  AMAX_SEED_ENTRA_CLIENT_SECRET_REF: z.string().regex(/^env:[A-Z0-9_]+$/, "env:VAR_NAME"),
  /** JSON object: Entra group object id → amax role or roles, e.g. {"<gid>": ["Admin"]}. */
  AMAX_SEED_ROLE_GROUPS: z.string().transform((s, ctx) => {
    try {
      const raw = JSON.parse(s) as Record<string, string | string[]>;
      const pairs = Object.entries(raw).flatMap(([g, r]) => (Array.isArray(r) ? r : [r]).map((role) => [g, role] as const));
      const bad = pairs.filter(([, r]) => !isRole(r));
      if (bad.length) ctx.addIssue({ code: "custom", message: `unknown roles: ${bad.map(([, r]) => r).join(", ")}` });
      return pairs;
    } catch {
      ctx.addIssue({ code: "custom", message: "must be a JSON object" });
      return z.NEVER;
    }
  }),
});

export const entraIssuer = (directoryId: string) => `https://login.microsoftonline.com/${directoryId}/v2.0`;

// Idempotent: run as the schema owner after migrations (`pnpm --filter @amax/auth seed`).
export async function seedFirstTenant(owner: postgres.Sql, env: Record<string, string | undefined>) {
  const cfg = schema.parse(env);
  const existing = await owner`select tenant_id from auth.identity_provider where directory_id = ${cfg.AMAX_SEED_ENTRA_DIRECTORY_ID}`;
  if (existing.length) return { tenantId: existing[0].tenant_id as string, created: false };
  return owner.begin(async (tx) => {
    const [{ id: tenantId }] = await tx`insert into core.tenant (name) values (${cfg.AMAX_SEED_TENANT_NAME}) returning id`;
    await tx`insert into auth.identity_provider (tenant_id, issuer, directory_id, client_id, client_secret_ref)
      values (${tenantId}, ${entraIssuer(cfg.AMAX_SEED_ENTRA_DIRECTORY_ID)}, ${cfg.AMAX_SEED_ENTRA_DIRECTORY_ID}, ${cfg.AMAX_SEED_ENTRA_CLIENT_ID}, ${cfg.AMAX_SEED_ENTRA_CLIENT_SECRET_REF})`;
    for (const [group, role] of cfg.AMAX_SEED_ROLE_GROUPS) {
      await tx`insert into auth.role_mapping (tenant_id, group_id, role) values (${tenantId}, ${group}, ${role})`;
    }
    return { tenantId: tenantId as string, created: true };
  });
}
