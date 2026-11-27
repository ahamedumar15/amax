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

## Verify
