import { z } from "zod";
import { withTenant } from "@amax/db";
import { contextFor, getRuntime } from "@amax/core/server";
import { buildExport, destroyDataKey, failExport, offboardingState, pruneBackups, snapshotKind, takeSnapshot } from "@amax/core/backup";
import { ensureDataKey } from "@amax/core/secrets/datakey";
import { cron, defineWorkflow, NonRetryableError, sleep, step } from "@amax/workflows";

const job = (tenantId: string, name: string) => contextFor.job(tenantId, name);
const DAY_MS = 86_400_000;

// 034 AC-2: tonight's encrypted snapshot (monthly on the first of a month), then 032's pruning.
export const backupSnapshot = defineWorkflow({
  name: "core.backup-snapshot",
  title: "Tenant backup",
  async run(ctx) {
    await step("data-key", () => ensureDataKey(job(ctx.tenantId, "core.backup-snapshot")), { retry: { maxAttempts: 3 } });
    const kind = await step("kind", () => withTenant(getRuntime().db, ctx.tenantId, snapshotKind));
    const snap = await step("snapshot", () => takeSnapshot(job(ctx.tenantId, "core.backup-snapshot"), { kind }), { timeout: "30m", retry: { maxAttempts: 3 } });
    const pruned = await step("prune", () => pruneBackups(job(ctx.tenantId, "core.backup-snapshot"), {}), { timeout: "15m", retry: { maxAttempts: 3 } });
    return { ok: true, summary: `${kind === "monthly" ? "Monthly" : "Daily"} snapshot, ${snap.rows} rows in ${snap.tables} tables${pruned.paused ? "; pruning paused by a legal hold" : `; pruned ${pruned.snapshots}`}` };
  },
});

// 034 AC-4: started by the second Admin's approval.
export const tenantExport = defineWorkflow({
  name: "core.tenant-export",
  title: "Tenant export",
  input: z.object({ exportId: z.uuid() }),
  async run(ctx, input) {
    try {
      const out = await step("build", () => buildExport(job(ctx.tenantId, "core.tenant-export"), { id: input.exportId }), { timeout: "1h", retry: { maxAttempts: 2 } });
      return { ok: true, summary: `Export ready: ${out.modules} modules, ${out.files} files` };
    } catch (e) {
      await step("fail", () => failExport(job(ctx.tenantId, "core.tenant-export"), { id: input.exportId, error: e instanceof Error ? e.message.slice(0, 500) : "export failed" }));
      throw new NonRetryableError(`Export failed: ${e instanceof Error ? e.message : e}`);
    }
  },
});

// 034 AC-5: 30 days, then any legal hold, then the data key is destroyed. Checked again before each step.
export const tenantOffboarding = defineWorkflow({
  name: "core.tenant-offboarding",
  title: "Tenant offboarding",
  input: z.object({ offboardingId: z.uuid() }),
  async run(ctx, input) {
    for (let i = 0; i < 400; i++) {
      const s = await step(`check-${i}`, () => withTenant(getRuntime().db, ctx.tenantId, (tx) => offboardingState(tx, input.offboardingId)));
      if (s.next === "stop") return { ok: true, summary: `Offboarding ${s.status}; the data key was kept` };
      if (s.next === "destroy") {
        await step("destroy", () => destroyDataKey(job(ctx.tenantId, "core.tenant-offboarding"), { id: input.offboardingId }));
        return { ok: true, summary: "Data key destroyed: this tenant's backups can no longer be read" };
      }
      await sleep(`wait-${i}`, s.next === "wait" ? Math.min(s.waitMs ?? DAY_MS, 30 * DAY_MS) : DAY_MS);
    }
    throw new NonRetryableError("Offboarding still held after 400 checks");
  },
});

export const backupWorkflows = [backupSnapshot, tenantExport, tenantOffboarding];
export const backupSchedules = [
  cron({ name: "core.backup-snapshot", title: "Tenant backup", description: "Encrypted snapshot of every table, kept 14 days (monthly ones 12 months), in the tenant's data region", workflow: "core.backup-snapshot", cron: "0 2 * * *" }),
];
