import type { ModuleManifest } from "@amax/core";

/**
 * 055: IT Admin holds every Admin-only permission by name, never through the Admin bypass in can.ts,
 * and never the `pricing` class (SENSITIVITY_POLICY), so money figures stay hidden from the role.
 * apps/web/tests/admin/it-admin.test.ts fails when a new Admin-only tool isn't listed here.
 */
export const IT_ADMIN_GRANTS = [
  "settings:read", "operations:read",
  "secrets:credential:read", "secrets:credential:manage",
  "mcp:client:read", "mcp:client:revoke",
  "ai:policy:manage", "ai:usage:read",
  "workflows:admin",
  "core.audit.read",
  "privacy:read", "privacy:manage",
  "api:credential:read", "api:credential:manage", "api:webhook:read", "api:webhook:manage",
] as const;

export const itAdminGrants: Pick<ModuleManifest, "grants"> = { grants: { ITAdmin: [...IT_ADMIN_GRANTS] } };
