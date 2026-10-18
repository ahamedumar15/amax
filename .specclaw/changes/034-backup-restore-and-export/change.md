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

- [x] `T1` — Mock: the 034 section gains an Exports card: each tenant export with its approval state and link expiry (AC-4, AC-6)
  Files: .specclaw/mock/index.html
- [x] `T2` — UI: the Backups and export screen at /settings/backups matching the mock (recovery tickets, restore drills, exports), Admin only: its nav entry replaces 055's "Coming soon" item and the Settings hub card goes live; read tools with pin specs (AC-3, AC-4, AC-6)
  Files: apps/web/app/(app)/settings/backups/*, apps/web/lib/admin/backups.ts, apps/web/lib/admin/index.ts, apps/web/lib/admin/status.ts, apps/web/lib/operations.ts, apps/web/lib/registry.ts, apps/web/lib/profile.ts, packages/ui/src/components/Shell.tsx, packages/core/src/backup/view.ts, packages/core/src/backup/catalog.ts, packages/db/migrations/0030_backup.sql, apps/web/tests/admin/it-admin.test.ts, apps/web/tests/e2e/admin.spec.ts
  Depends: T1
- [x] `T3` — Encrypted tenant snapshots: daily (kept 14 days) and monthly (kept 12 months) JSON per table sealed with the tenant's data key (031), written only to storage in the tenant's data region (033), pruning paused by a legal hold (032); the bucket's versioning is checked and shown (AC-2)
  Files: packages/core/src/backup/snapshot.ts, packages/core/src/backup/storage.ts, packages/core/src/backup/tables.ts, packages/core/src/adapters/storage.ts, apps/web/lib/platform-workflows.ts, apps/web/lib/server.ts, packages/core/tests/backup-snapshot.test.ts
  Depends: T2
- [x] `T4` — Restore drill: restores the latest snapshot into a scratch database, checks every table's row count and the audit hash chain, and records the result (duration, rows, chain) through a service; due weekly or on request (`request_restore_drill`) (AC-3)
  Files: packages/core/src/backup/drill.ts, apps/web/scripts/backups.ts, apps/web/lib/admin/backups.ts, packages/core/tests/backup-drill.test.ts
  Depends: T3
- [x] `T5` — Tenant export: an Admin asks in chat, a second Admin approves, then a 029 workflow writes JSON per module plus files to a tar, honouring the erasure state (032/060); a signed link expires in 24 hours (AC-4)
  Files: packages/core/src/backup/export.ts, packages/core/src/backup/tar.ts, packages/core/src/backup/link.ts, apps/web/app/api/backups/export/[id]/route.ts, apps/web/lib/admin/backups.ts, apps/web/lib/platform-workflows.ts, packages/core/tests/backup-export.test.ts
  Depends: T3
- [x] `T6` — Leaving tenant: offboarding offers an export, waits 30 days (a 029 workflow, paused while a legal hold is active), then destroys the tenant's data key through a gated database function so snapshots can't be read; every step audited (AC-5)
  Files: packages/core/src/backup/offboard.ts, packages/core/src/secrets/runtime.ts, packages/db/migrations/0030_backup.sql, apps/web/lib/platform-workflows.ts, apps/web/lib/admin/backups.ts, packages/core/tests/backup-offboard.test.ts
  Depends: T5
- [ ] `T7` — Deploy: point-in-time recovery per host in docs/operations.md (managed Postgres for Vercel and Cloudflare, CloudNativePG with WAL archiving on k3s), the chart's CNPG Cluster, ScheduledBackup and restore-drill CronJob, a Dockerfile ops target, podman timer notes (AC-1, AC-3)
  Files: docs/operations.md, docs/architecture.md, deploy/helm/amax/values.yaml, deploy/helm/amax/templates/postgres-cnpg.yaml, deploy/helm/amax/templates/restore-drill.yaml, deploy/podman/*, Dockerfile
  Depends: T4
- [ ] `T8` — Tests and CI: CI runs the drill on k3d (Postgres in the cluster, a snapshot, then the drill job); e2e for the screen, Admin-only visibility and the chat-confirmed export request; the 2% visual diff against the mock (AC-3, AC-4, AC-6)
  Files: .github/workflows/ci.yml, deploy/ci/*, apps/web/tests/e2e/backups.spec.ts, apps/web/tests/e2e/backups-visual.spec.ts, apps/web/playwright.config.ts, apps/web/playwright.auth.config.ts, apps/web/lib/backup-fixtures.ts, apps/web/scripts/seed-demo.ts
  Depends: T2, T4, T5, T6

## Verify
