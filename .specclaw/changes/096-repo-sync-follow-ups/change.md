# Repo sync follow-ups: a phase the repo reached stays recorded, every repo time is bounded, and the docs match

**Change:** 096-repo-sync-follow-ups · **Created:** 2026-11-10 · **Review:** change

**Depends on:** 095-pr-113-ci-green (same branch, PR #113).

## Problem

094 stopped at the five-pass cap with three findings open, and 095's review left two pre-existing ones. A read of
`state.json` that leaves a phase out (the file is gone, or verify went from done to failed on a re-run) deletes that
phase's stored time, so its "in the repo" history line and its `repo:<phase>` pin disappear. One malformed stored phase
entry hides every repo line. `sync_proposal`'s `meta.source` becomes a phase's read without the commit-sha check.
`sync_proposal` and `mark_synced` take a future `committedAt` (the push refuses one), which then marks the proposal stale
against every real push until the clock catches up, and `releasedAt` is an unchecked string. The delivery README still
says the Released card reads "In Prod · <release>".

## Mock Delta

What changes on screen, and where to see it: [`096-repo-sync-follow-ups`](../../mock/index.html#096-repo-sync-follow-ups)

A proposal whose verify was re-run and failed in the repo still shows "Verified in the repo · 18 Oct" in its history
(the repo reached it then); nothing else on screen changes.

## Acceptance Criteria

1. **AC-1** A phase the repo reached stays recorded: a read that leaves a phase out (no `state.json`, a status that moved
   on) keeps its stored entry and read; a read that gives a phase a new time replaces it. Table: left out, moved on,
   new time, same time, future time, not read at all.
2. **AC-2** Stored phase entries are read one by one: a malformed entry is skipped, and the others still show and pin.
3. **AC-3** A phase's read is recorded only when the write's `meta.source` is `<ref>@<sha>` by the one commit-sha rule
   (`sync/sha.ts`); otherwise the entry is stored with no read and its line says "From the repo".
4. **AC-4** `sync_proposal` and `mark_synced` refuse a `committedAt` in the future, as `sync_specclaw` does (one rule,
   `notFuture`, as a refine that still converts to JSON Schema); `releasedAt` is a datetime, and one in the future is
   unknown (`knownTime`). Rows in the `sync_proposal` table for both.
5. **AC-5** The delivery README says the Released card reads "In Prod" beside its release chip (095 AC-2).
6. **AC-6** Tests: a table per rule; the 089–095 suites and `tool-schemas` stay green.

## Tasks

- [x] `T1` — Repo phases: kept once reached, read entry by entry, a read recorded only from `<ref>@<sha>` (AC-1, AC-2, AC-3)
  Files: modules/delivery/server/repo-time.ts, modules/delivery/tests/repo-sync-096.test.ts, modules/delivery/tests/repo-dates-094.test.ts
- [x] `T2` — `committedAt` refused in the future on `sync_proposal` and `mark_synced`; `releasedAt` a bounded datetime (AC-4)
  Files: modules/delivery/server/services.ts, modules/delivery/mcp.ts, modules/delivery/server/push.ts, modules/delivery/tests/repo-sync-096.test.ts
- [x] `T3` — README and suites (AC-5, AC-6)
  Files: modules/delivery/README.md
  Depends: T1, T2

## Verify

<!-- Filled by verify. -->
