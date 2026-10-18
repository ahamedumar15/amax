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

## Verify
