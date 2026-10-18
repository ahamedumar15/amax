import { sql } from "drizzle-orm";
import { z } from "zod";
import { defineService } from "@amax/core/server";
import { by } from "./context";

// 025 AC-1: the agent reads nothing until an Admin records Entra admin consent, and then only the
// mailboxes and Teams channels on the tenant's allow-list. Each change is an audited service and a
// chat write tool; there is no form.
const MANAGE = "inbox-agent:manage";
const CHANNEL = /^[A-Za-z0-9-]{8,64}\/[A-Za-z0-9:@._-]{8,200}$/;

export const SourceInput = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("mailbox"), address: z.email().max(200), label: z.string().trim().min(2).max(80).optional() }),
  z.object({ kind: z.literal("channel"), address: z.string().regex(CHANNEL, "a channel is <team id>/<channel id>"), label: z.string().trim().min(2).max(80) }),
]);

export const recordConsent = defineService({
  name: "inbox-agent.consent.record", action: MANAGE, resource: "inbox_agent.consent",
  input: z.object({ entraTenantId: z.uuid(), granted: z.boolean() }),
  async run(tx, a, ctx) {
    const [before] = await tx.execute(sql`select entra_tenant_id, granted, sandbox from inbox_agent.consent`);
    await tx.execute(sql`insert into inbox_agent.consent (tenant_id, entra_tenant_id, sandbox, granted, recorded_by) values (${ctx.tenantId}, ${a.entraTenantId}, false, ${a.granted}, ${by(ctx)})
      on conflict (tenant_id) do update set entra_tenant_id = excluded.entra_tenant_id, sandbox = false, granted = excluded.granted, recorded_by = excluded.recorded_by, recorded_at = now()`);
    const after = { entraTenantId: a.entraTenantId, granted: a.granted };
    return { result: after, resourceId: ctx.tenantId, before: before ? { entraTenantId: before.entra_tenant_id, granted: before.granted, sandbox: before.sandbox } : null, after };
  },
});

export const allowSource = defineService({
  name: "inbox-agent.source.allow", action: MANAGE, resource: "inbox_agent.source", input: SourceInput,
  async run(tx, a, ctx) {
    const [dup] = await tx.execute(sql`select id from inbox_agent.source where removed_at is null and kind = ${a.kind} and lower(address) = lower(${a.address})`);
    if (dup) throw new Error(`that ${a.kind} is already on the allow-list`);
    const label = a.label ?? a.address;
    const [row] = await tx.execute(sql`insert into inbox_agent.source (tenant_id, kind, address, label, acts_for, allowed_by, read_until)
      values (${ctx.tenantId}, ${a.kind}, ${a.address}, ${label}, ${ctx.onBehalfOf ?? ctx.actor.id}, ${by(ctx)}, now()) returning id`);
    return { result: { id: row.id as string, kind: a.kind, label }, resourceId: row.id as string, after: { kind: a.kind, label } };
  },
});

export const removeSource = defineService({
  name: "inbox-agent.source.remove", action: MANAGE, resource: "inbox_agent.source",
  input: z.object({ sourceId: z.uuid() }),
  async run(tx, { sourceId }, ctx) {
    const [row] = await tx.execute(sql`update inbox_agent.source set removed_at = now(), removed_by = ${by(ctx)} where id = ${sourceId} and removed_at is null returning kind, label`);
    if (!row) throw new Error("that source isn't on the allow-list");
    return { result: { id: sourceId, removed: true }, resourceId: sourceId, before: { allowed: true }, after: { allowed: false, kind: row.kind, label: row.label } };
  },
});
