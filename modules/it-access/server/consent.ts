import { sql } from "drizzle-orm";
import { z } from "zod";
import type { Tx } from "@amax/db";
import { defineService } from "@amax/core/server";
import { EVENTS, WRITE_SCOPES, type ConsentChanged } from "../contracts";
import { actorOf, CONSENT, mayAct } from "./read";

/** AC-1: the scopes the tenant consented to, or none while the write registration is off (the default). */
export async function writeScopes(tx: Tx): Promise<string[]> {
  const [c] = await tx.execute(sql`select enabled, scopes from it_access.write_consent`);
  return c?.enabled ? ((c.scopes as string[]) ?? []) : [];
}

// AC-1: an Admin turns the write registration on for this tenant, naming the Graph scopes it may use
// (an empty list or `enabled: false` turns it off). Only a person can; no role but Admin holds it.
export const setWriteConsent = defineService({
  scoped: true,
  name: "it-access.consent.set",
  action: CONSENT,
  resource: "it_access.write_consent",
  input: z.object({ enabled: z.boolean(), scopes: z.array(z.enum(WRITE_SCOPES)).max(WRITE_SCOPES.length).default([]) }),
  async run(tx, input, ctx) {
    if (ctx.actor.kind !== "user") throw new Error("only a person can consent to the write registration");
    mayAct(ctx, CONSENT);
    const scopes = input.enabled ? [...new Set(input.scopes)] : [];
    const enabled = input.enabled && scopes.length > 0;
    const before = await writeScopes(tx);
    const by = actorOf(ctx);
    await tx.execute(sql`insert into it_access.write_consent (tenant_id, enabled, scopes, consented_by) values (${ctx.tenantId}, ${enabled}, ${`{${scopes.join(",")}}`}, ${by})
      on conflict (tenant_id) do update set enabled = excluded.enabled, scopes = excluded.scopes, consented_by = excluded.consented_by, consented_at = now()`);
    const payload: ConsentChanged = { enabled, scopes, by };
    return { result: { enabled, scopes }, resourceId: ctx.tenantId, before: { scopes: before }, after: { enabled, scopes }, events: [{ name: EVENTS.consentChanged, payload }] };
  },
});
