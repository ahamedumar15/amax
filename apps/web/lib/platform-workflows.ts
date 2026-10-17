import { withTenant } from "@amax/db";
import { getRuntime, verifyAuditChain } from "@amax/core/server";
import { cron, defineWorkflow, NonRetryableError, step } from "@amax/workflows";

export const auditCheck = defineWorkflow({
  name: "core.audit-check",
  title: "Audit chain check",
  async run(ctx) {
    const result = await step("verify", () => withTenant(getRuntime().db, ctx.tenantId, (tx) => verifyAuditChain(tx, ctx.tenantId)), { timeout: "5m", retry: { maxAttempts: 3 } });
    if (!result.ok) throw new NonRetryableError(`Audit chain broken at event ${result.brokenAt}: ${result.reason}`);
    return { ok: true, summary: `Intact, ${result.length} events` };
  },
});

export const platformWorkflows = {
  id: "core",
  workflows: [auditCheck],
  schedules: [cron({ name: "core.audit-check", title: "Audit chain check", description: "Re-verifies the tamper-evident audit log", workflow: "core.audit-check", cron: "30 2 * * *" })],
};
