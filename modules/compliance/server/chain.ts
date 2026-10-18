import { sql } from "drizzle-orm";
import { z } from "zod";
import { contextFor, defineService, verifyAuditChain } from "@amax/core/server";
import { cron, defineWorkflow, NonRetryableError, step } from "@amax/workflows";
import { EVENTS, type ChainChecked } from "../contracts";
import { brokenLabel, toChainCheck } from "./chain-read";

// Verifies the 003 audit hash chain end to end and records how far it verified, or the row where it
// broke: its sequence number, action and resource, so the record names the changed row.
export const checkAuditChain = defineService({
  name: "compliance.chain.check", action: "compliance:manage", resource: "compliance.chain_check",
  input: z.object({}),
  async run(tx, _a, ctx) {
    const result = await verifyAuditChain(tx, ctx.tenantId);
    const [bad] = result.ok ? [] : await tx.execute(sql`select action, resource from core.audit_event where tenant_id = ${ctx.tenantId} and seq = ${result.brokenAt}`);
    const [r] = await tx.execute(result.ok
      ? sql`insert into compliance.chain_check (tenant_id, ok, events, head_seq, head_hash, source) values (${ctx.tenantId}, true, ${result.length}, ${result.length || null}, ${result.head}, ${ctx.source}) returning *`
      : sql`insert into compliance.chain_check (tenant_id, ok, events, broken_at, reason, broken_action, broken_resource, source)
          values (${ctx.tenantId}, false, ${result.brokenAt - 1}, ${result.brokenAt}, ${result.reason}, ${(bad?.action as string | undefined) ?? null}, ${(bad?.resource as string | undefined) ?? null}, ${ctx.source}) returning *`);
    const check = toChainCheck(r);
    const payload: ChainChecked = { checkId: check.id, ok: check.ok, events: check.events, headSeq: check.headSeq, brokenAt: check.brokenAt };
    return { result: { ...check, summary: check.ok ? `Verified ${check.events.toLocaleString("en-US")} events, no gaps` : brokenLabel(check) }, resourceId: check.id, after: payload,
      events: [{ name: EVENTS.chainChecked, payload }] };
  },
});

export const auditChainCheck = defineWorkflow({
  name: "compliance.audit-chain",
  title: "Compliance audit-chain check",
  async run(ctx) {
    const out = await step("verify", () => checkAuditChain(contextFor.job(ctx.tenantId, "compliance.audit-chain"), {}), { timeout: "10m", retry: { maxAttempts: 3 } });
    if (!out.ok) throw new NonRetryableError(out.summary);
    return { ok: true, summary: out.summary };
  },
});

export const auditChainSchedule = cron({ name: "compliance.audit-chain", title: "Compliance audit-chain check", description: "Verifies the audit hash chain daily and records the last verified point for the evidence export (ISO 27001 A.8.15)", workflow: "compliance.audit-chain", cron: "0 6 * * *" });
