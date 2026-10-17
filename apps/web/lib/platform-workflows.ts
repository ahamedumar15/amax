import { withTenant } from "@amax/db";
import { contextFor, getRuntime, verifyAuditChain } from "@amax/core/server";
import { purgeDue } from "@amax/core/privacy";
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

// 032 AC-3: deletes or anonymises due records through the purge service, audited by class and count.
export const privacyPurge = defineWorkflow({
  name: "core.privacy-purge",
  title: "Data retention purge",
  async run(ctx) {
    const out = await step("purge", () => purgeDue(contextFor.job(ctx.tenantId, "core.privacy-purge"), {}), { timeout: "15m", retry: { maxAttempts: 3 } });
    const n = out.counts.reduce((sum, c) => sum + c.n, 0);
    const paused = out.paused.length ? `, ${out.paused.length} rules paused by a legal hold` : "";
    if (out.failed.length) throw new NonRetryableError(`Purged ${n} records; ${out.failed.length} rules failed: ${out.failed.join(", ")}`);
    return { ok: true, summary: `Purged ${n} records${paused}` };
  },
});

export const platformWorkflows = {
  id: "core",
  workflows: [auditCheck, privacyPurge],
  schedules: [
    cron({ name: "core.privacy-purge", title: "Data retention purge", description: "Deletes or anonymises records past their retention period, except those under a legal hold", workflow: "core.privacy-purge", cron: "0 1 * * *" }),
    cron({ name: "core.audit-check", title: "Audit chain check", description: "Re-verifies the tamper-evident audit log", workflow: "core.audit-check", cron: "30 2 * * *" }),
  ],
};
