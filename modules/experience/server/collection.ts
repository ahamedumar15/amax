import { sql } from "drizzle-orm";
import { z } from "zod";
import { defineService } from "@amax/core/server";
import { EVENTS, type CollectionSet } from "../contracts";
import { ADMIN, by, todayOf } from "./read";

export const CollectionInput = z.object({ legalEntityId: z.uuid(), enabled: z.boolean(), noticeOn: z.iso.date().optional().describe("The day the notice to staff went out (YYYY-MM-DD)") });

// AC-2: an Admin switches collection on for one legal entity only after recording the date the staff
// notice went out. Switching off keeps the notice; the next collection reads nothing for that entity.
export const setCollection = defineService({
  name: "experience.collection.set", action: ADMIN, resource: "experience.collection",
  input: CollectionInput,
  async run(tx, a, ctx) {
    if (ctx.actor.kind !== "user") throw new Error("only a person can switch collection on or off");
    const [e] = await tx.execute(sql`select id from core.legal_entity where id = ${a.legalEntityId}`);
    if (!e) throw new Error("no such legal entity");
    const [was] = await tx.execute(sql`select enabled, notice_on::text as notice_on from experience.collection where legal_entity_id = ${a.legalEntityId}`);
    const noticeOn = a.noticeOn ?? (was?.notice_on as string | undefined) ?? null;
    if (a.enabled && !noticeOn) throw new Error("record the date the notice to staff went out before switching collection on");
    if (noticeOn && noticeOn > (await todayOf(tx))) throw new Error("the notice must have gone out already");
    await tx.execute(sql`insert into experience.collection (tenant_id, legal_entity_id, notice_on, enabled, set_by) values (${ctx.tenantId}, ${a.legalEntityId}, ${noticeOn}, ${a.enabled}, ${by(ctx)})
      on conflict (tenant_id, legal_entity_id) do update set notice_on = excluded.notice_on, enabled = excluded.enabled, set_by = excluded.set_by, set_at = now()`);
    const payload: CollectionSet = { legalEntityId: a.legalEntityId, enabled: a.enabled, noticeOn, by: by(ctx) };
    return { result: { enabled: a.enabled, noticeOn }, resourceId: a.legalEntityId, before: was ? { enabled: was.enabled, noticeOn: was.notice_on } : null, after: { enabled: a.enabled, noticeOn },
      events: [{ name: EVENTS.collectionSet, payload }] };
  },
});

export const RemediationInput = z.object({ enabled: z.boolean(), scriptPolicyId: z.string().regex(/^[0-9a-f-]{36}$/).optional().describe("The Intune remediation script policy to run on the affected devices") });

// AC-5: approved remediations run through the Graph write registration only once an Admin switches
// it on for the tenant (off by default); until then each is recorded as one to run by hand in Intune.
export const setRemediation = defineService({
  name: "experience.remediation.set", action: ADMIN, resource: "experience.settings",
  input: RemediationInput,
  async run(tx, a, ctx) {
    if (ctx.actor.kind !== "user") throw new Error("only a person can switch remediation on or off");
    const [was] = await tx.execute(sql`select remediation_enabled from experience.settings`);
    await tx.execute(sql`insert into experience.settings (tenant_id, remediation_enabled, remediation_script, remediation_set_by, remediation_set_at) values (${ctx.tenantId}, ${a.enabled}, ${a.scriptPolicyId ?? null}, ${by(ctx)}, now())
      on conflict (tenant_id) do update set remediation_enabled = excluded.remediation_enabled, remediation_script = coalesce(excluded.remediation_script, experience.settings.remediation_script),
        remediation_set_by = excluded.remediation_set_by, remediation_set_at = now()`);
    return { result: { enabled: a.enabled }, resourceId: ctx.tenantId, before: { enabled: was?.remediation_enabled === true }, after: { enabled: a.enabled } };
  },
});
