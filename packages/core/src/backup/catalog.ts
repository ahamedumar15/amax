import type { ServiceContext } from "../authorize";
import type { RetentionEntry } from "../module";

export const BACKUP_READ = "backup:read";
export const BACKUP_MANAGE = "backup:manage";

/** AC-1 and AC-3 targets, the snapshot schedule's retention (AC-2) and the offboarding wait (AC-5). */
export const TARGETS = { rpoMinutes: 15, rtoMinutes: 240, slowMinutes: 60, dailyDays: 14, monthlyKept: 12, waitDays: 30, linkHours: 24 } as const;

export class BackupError extends Error {
  readonly retryable = false;
  readonly code = "invalid_input";
  constructor(message: string) {
    super(message);
    this.name = "BackupError";
  }
}

/** 032: who asked for drills, exports and offboarding, and the snapshots' own metadata. */
export const backupRetention: RetentionEntry[] = [
  { table: "backup.snapshot", label: "Backup snapshots", fields: ["storage_key"], class: "personal", period: "P13M", start: { at: ["taken_at"] }, action: "delete" },
  { table: "backup.drill", label: "Restore drill history", subject: ["requested_by"], fields: ["requested_by", "note"], class: "personal", period: "P2Y", start: { at: ["requested_at"] }, action: "delete" },
  { table: "backup.export", label: "Tenant exports", subject: ["requested_by", "approved_by"], fields: ["requested_by", "approved_by", "reason"], class: "personal", period: "P1Y", start: { at: ["requested_at"] }, action: "anonymise" },
  { table: "backup.offboarding", label: "Offboarding records", subject: ["started_by", "cancelled_by"], fields: ["started_by", "cancelled_by", "reason"], class: "personal", period: "P1Y", start: { at: ["destroyed_at", "cancelled_at"] }, action: "anonymise" },
];

export const personOf = (ctx: ServiceContext) => ctx.onBehalfOf ?? ctx.actor.id;

/** AC-4, AC-5: only a person with the Admin role, never an agent or a credential acting alone. */
export function assertAdminPerson(ctx: ServiceContext, what: string) {
  if (ctx.actor.kind !== "user" || !ctx.actor.roles?.includes("Admin")) throw new BackupError(`only an Admin, signed in, can ${what}`);
}
