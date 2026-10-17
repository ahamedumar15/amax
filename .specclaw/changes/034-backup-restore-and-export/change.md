# Backup, restore and tenant export

**Change:** 034-backup-restore-and-export · **Created:** 2026-10-17
**Lane:** Platform · **Module:** `deploy/, packages/db (backup, export)` · **Depends on:** [003](../003-data-core/change.md), [031](../031-secrets-and-keys/change.md)

## Problem

Payroll, HR files and invoices are records a company cannot lose, yet no proposal covers backups, restores, or how a customer gets its data out and has it deleted when it leaves (architecture review F19).

## Mock Delta

What changes on screen, and where to see it: [`034-backup-restore-and-export`](../../mock/index.html#034-backup-restore-and-export)

New admin screen, Backups and export: the recovery window, last backup and last restore drill, the drill history, and tenant export with its approval state.

## Acceptance Criteria

1. **AC-1** Postgres has point-in-time recovery with a recovery point of 15 minutes or less and a recovery time of 4 hours or less. `docs/operations.md` explains the setup for each host: managed Postgres for Vercel and Cloudflare, and CloudNativePG with WAL archiving through the Helm chart on k3s.
2. **AC-2** File storage is versioned. Backups are encrypted, stored in the tenant's data region (033) and kept according to 032.
3. **AC-3** A weekly restore drill restores the latest backup into a scratch database and checks row counts and the audit hash chain. The result appears on screen, and CI runs the drill on k3d.
4. **AC-4** An Admin exports the whole tenant as JSON per module plus files, through a signed link that expires in 24 hours, after a second Admin approves.
5. **AC-5** When a tenant leaves, amax offers an export, waits 30 days, then destroys the tenant's data key (031) so backups can no longer be read. Each step is audited.
6. **AC-6** The Backups and export screen matches the mock within a 2% visual diff and is visible to Admin only.

## Tasks

## Verify
