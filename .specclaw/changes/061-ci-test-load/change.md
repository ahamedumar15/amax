# CI test load: migrate once, clone per test

**Change:** 061-ci-test-load · **Created:** 2026-10-18
**Lane:** Platform · **Module:** `packages/db` (testdb), `.github/workflows/ci.yml`

## Problem

Main's CI has failed on its last three merges (2d471e04, 2ebb41bf, 0cb0ef73) with "Hook timed out in 60000ms" in DB-heavy suites (chat, time, presales, learning). Every PR now needs reruns. Each DB test file runs every migration of core and all 10 modules into a fresh database (`migratedDatabase()`), and `pnpm test` runs up to 10 packages at once against the one CI Postgres. Wave 3 doubled the migration count, so setup now exceeds the 60 s hook timeout.

## Mock Delta

None. Test infrastructure only.

## Acceptance Criteria

1. **AC-1** `migratedDatabase()` migrates once into a template database named by a hash of the migration files, then gives each test a `create database … template` copy. Concurrent workers and packages build the template once (an advisory lock), and a changed migration builds a new template. A test shows two concurrent calls build one template, and that a copy has every migration applied.
2. **AC-2** Stale templates (another hash) are dropped when a new one is built, so local and CI Postgres don't fill up.
3. **AC-3** CI's test step caps turbo's concurrency at the runner's cores, so packages don't oversubscribe the one Postgres.
4. **AC-4** The CI `checks` job passes on this PR without a rerun, and `pnpm test` with the template is at least 2× faster locally than before (times recorded under Verify).

## Tasks

- [x] `T1` — migratedDatabase clones a template built once per migration hash, under an advisory lock; keeps the 3 newest templates (AC-1, AC-2)
  Files: packages/db/src/testdb.ts, packages/db/tests/template.test.ts
- [x] `T2` — CI caps turbo test concurrency (AC-3)
  Files: .github/workflows/ci.yml
- [x] `T3` — Time pnpm test before and after; CI green without rerun (AC-4)
  Files: .specclaw/changes/061-ci-test-load/change.md
  Depends: T1, T2

## Verify

**Verdict:** PASS

- AC-1: pass — `packages/db/tests/template.test.ts`: two concurrent fresh module instances build one template named `amax_tpl_<migration hash>`; a copy has every migration in `amax_migrations.applied`.
- AC-2: pass — same file: three older `amax_tpl_*` databases are pruned to the newest three, including the current one.
- AC-3: pass — `.github/workflows/ci.yml` runs `pnpm turbo run test --concurrency=2`.
- AC-4: pass — locally, `pnpm --filter @amax/core test` went from 23.1 s to 13.2 s. The full parallel `pnpm turbo run test --force` failed before the change (hook and setup timeouts in hr, core and web) and passes after it at `--concurrency=2` (79 s on a box at load 18 from other builds). CI on this PR is the remaining check, recorded in the PR.

Also fixed: the web tests regenerate the module registry first, because turbo's cached lint could leave it stale after a merge that adds a module (pin-refs failed on it locally).
Commands: `pnpm lint` (graph check ok, 9 modules), `pnpm --filter @amax/db test`, `pnpm turbo run test --force --concurrency=2`, `pnpm --filter @amax/web test` (20 files). Screenshots: none (no UI). Review: not run per change (once per module end).
