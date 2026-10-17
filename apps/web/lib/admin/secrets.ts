import { z } from "zod";
import { CONNECTOR_IDS, CONNECTORS, listCredentials, putSecret, REVOKE_REASONS, revokeSecret, type CredentialRow } from "@amax/core/secrets";
import { ToolError } from "@amax/mcp";
import type { Viewer } from "@amax/auth";
import { ctxFor, notFound, read, tool, write } from "./tool";

const connector = z.enum(CONNECTOR_IDS).describe(`One of ${CONNECTOR_IDS.join(", ")}`);
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).describe("YYYY-MM-DD; the credential stops working at the end of that day (UTC)");
const READ = "secrets:credential:read";
const MANAGE = "secrets:credential:manage";

const meta = (r: CredentialRow) => ({ ...r, name: CONNECTORS[r.connector].name, usedFor: CONNECTORS[r.connector].usedFor });
const rows = async (v: Viewer) => (await listCredentials(ctxFor(v, "chat"))).rows;
const current = async (v: Viewer, c: string) => (await rows(v)).find((r) => r.connector === c && r.status !== "revoked");

// The value only ever comes from the masked field on chat's confirm card (047 AC-4).
function typed(secret: string | undefined) {
  if (!secret) throw new ToolError("the value is typed into the masked field on amax chat's confirm card; it can't be sent as tool input", "invalid_input");
  return secret;
}
const endOf = (d: string | undefined) => (d ? `${d}T23:59:59Z` : undefined);

// "Keep its expiry" keeps a future date or no date. A past one can't be kept: dropping it would
// leave a credential that never expires and never shows as Expiring again (052 review).
export function keptExpiry(connector: string, expiresAt: Date | null, now = new Date()): string | null {
  if (!expiresAt) return null;
  if (expiresAt > now) return expiresAt.toISOString();
  throw new ToolError(`the ${connector} credential's expiry (${expiresAt.toISOString().slice(0, 10)}) has passed; give a new expiresAt for the rotated value`, "invalid_input");
}

export const secretTools = [
  tool({ ...read(READ), name: "list_secrets", description: "Every connector credential's status, expiry, rotation and last use. Never the values.", input: z.object({}), run: async (v) => (await rows(v)).map(meta) }),
  tool({ ...read(READ), name: "get_secret_meta", description: "One connector credential's status, expiry, rotation and last use. Never the value.", input: z.object({ connector }),
    run: async (v, a) => { const r = (await rows(v)).find((x) => x.connector === a.connector); if (!r) throw notFound(`credential ${a.connector}`); return meta(r); } }),
  tool({ ...write(MANAGE), name: "put_secret", description: "Add a connector credential. The person types the value on the confirm card.", secretInput: { label: "Value" },
    input: z.object({ connector, expiresAt: day.optional() }),
    run: async (v, a, s, secret) => {
      if (await current(v, a.connector)) throw new ToolError(`${a.connector} already has a credential; use rotate_secret`, "invalid_input");
      return putSecret(ctxFor(v, s), { connector: a.connector, value: typed(secret), expiresAt: endOf(a.expiresAt) ?? null });
    } }),
  tool({ ...write(MANAGE), name: "rotate_secret", description: "Rotate a connector credential to a new value, keeping its expiry unless a new one is given. The person types the value on the confirm card.",
    secretInput: { label: "New value" },
    input: z.object({ connector, expiresAt: day.optional(), graceHours: z.number().int().min(0).max(720).optional().describe("How long the old value keeps working; default 72") }),
    run: async (v, a, s, secret) => {
      const row = await current(v, a.connector);
      if (!row) throw new ToolError(`${a.connector} has no credential to rotate; use put_secret`, "invalid_input");
      return putSecret(ctxFor(v, s), { connector: a.connector, value: typed(secret), expiresAt: endOf(a.expiresAt) ?? keptExpiry(a.connector, row.expiresAt), graceHours: a.graceHours ?? 72 });
    } }),
  tool({ ...write(MANAGE), name: "revoke_secret", description: "Revoke a connector credential now; its stored value is destroyed.", destructive: true,
    input: z.object({ connector, reason: z.enum(REVOKE_REASONS) }), run: (v, a, s) => revokeSecret(ctxFor(v, s), a) }),
];
