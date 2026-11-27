# PR #134's CI green: signed-in e2e specs run signed in, and the restore drill orders around the release cycle

**Change:** 154-pr-134-ci-green · **Created:** 2026-11-27 · **Review:** change

## Problem

PR #134's first CI run failed two jobs. **checks:** the public e2e run (`playwright.config.ts`, no database) ran two
signed-in specs this stack added, because neither is on its `testIgnore` list: `project-tabs.spec.ts` (144) asks for the
`amax_e2e` database, and `release-pages.spec.ts` (147) waits for the demo sign-in form; `release-pages` is also matched
by no project in `playwright.auth.config.ts`, so it never runs signed in. **docker-k3s:** the restore drill failed with
`task_proposal_id_fkey`. Migration 0025 made a foreign-key cycle (`release.completing_deployment_id → deployment`,
`deployment.release_id → release`); the drill's `inOrder` sorts tables parents first and, when no table is ready, appends
every remaining one at once in no order, so tasks were inserted before their proposals.

## Mock Delta

No screen changes. This change gets no mock section (CI only).

## Acceptance Criteria

1. **AC-1 E2E configs.** `playwright.config.ts` ignores `project-tabs` and `release-pages`; `playwright.auth.config.ts`
   runs `release-pages` in its `writes` project (it creates and edits releases). A test lists every e2e spec that signs in
   or opens the database and checks each one is ignored by the public config and matched by exactly one signed-in
   project, so a new spec can't slip past again.
2. **AC-2 The cycle is deferrable.** Migration 0029 makes `release_completing_deployment_id_fkey` deferrable, initially
   deferred, so within one transaction a release may be written before the deployment that completed it (checked at
   commit). Nothing else about the constraint changes.
3. **AC-3 The drill orders around it.** `inOrder` leaves deferrable foreign keys out of the order (their check waits for
   the restore's commit). If tables are still left with no parent restored first (a cycle of non-deferrable keys), the
   drill fails with a clear error naming those tables, instead of inserting them in no order.
4. **AC-4 Tests.** The drill test restores a snapshot that holds a completed release (its completing deployment, and a
   proposal with tasks), and every table's rows come back; `inOrder` is tested on a deferrable cycle (ordered) and a
   non-deferrable one (refused, naming both tables).
5. **AC-5 CI.** PR #134's `checks` (both e2e runs) and `docker-k3s` pass, or any remaining failure is shown to be
   unrelated with its log.

## Tasks

No UI task: CI only.

- [x] `T1` — AC-1: the public config ignores `project-tabs` and `release-pages`; the signed-in config runs `release-pages` in `writes`; a test reads every e2e spec, and each one that signs in or opens the database must be ignored by the public config and matched by exactly one signed-in project
  Files: apps/web/playwright.config.ts, apps/web/playwright.auth.config.ts, apps/web/tests/e2e-configs-154.test.ts
- [x] `T2` — AC-2 AC-3: migration 0029 makes `release_completing_deployment_id_fkey` deferrable, initially deferred; `inOrder` (exported for its test) leaves deferrable keys out of the order and refuses a remaining cycle, naming its tables
  Files: modules/delivery/db/migrations/0029_release_completing_deferrable.sql, packages/core/src/backup/restore.ts
- [x] `T3` — AC-4: the drill restores a snapshot holding a completed release, its deployments, and a proposal with tasks; `inOrder` on a deferrable cycle (ordered) and a non-deferrable one (refused, naming both)
  Files: packages/core/tests/backup-restore-order-154.test.ts
  Depends: T2
- [ ] `T4` — AC-5: after the push, PR #134's `checks` (both e2e runs) and `docker-k3s` watched to the end; any remaining failure's log read and recorded
  Files: .specclaw/changes/154-pr-134-ci-green/change.md
  Depends: T1, T2, T3

## Verify

Build notes: the restore now turns user triggers off for the whole load and back on after `set constraints all immediate`,
because a table can't be altered while a deferred key check it queued is pending (the drill's first run on 0029 failed on
exactly that). The same rule meets 150's backfill test, which replays 0027 on today's schema: it now runs its batches with
`set constraints all immediate` (a real migration run applies 0027 before 0029). The README says so for later
migrations. Mutation checks: without 0029 the drill refuses, naming the tables in the cycle; without `release-pages` in
the signed-in config, the guard test fails on it. No per-task commits from the agent (git is read-only here).
