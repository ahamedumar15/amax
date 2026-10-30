# CI tests: order-independent sync, chat tool list

**Change:** 079-ci-test-fixes · **Created:** 2026-10-30 · **Review:** change

## Problem

The PR's `test` job fails in `@amax/delivery` (run 41046160367). `sync-import.test.ts` re-syncs this repo and gets
`updated: 1`: 070's change.md lists `T26` before `T25`, and the sync compares the repo's tasks in file order with the
stored ones, which come back sorted by ref, so 070 reads as changed on every run. `chat.test.ts` AC-5 still expects the
tools `whoami, search`; 076 AC-1 added `offer_choices` to every chat turn and missed this test.

## Mock Delta

What changes on screen, and where to see it: [`079-ci-test-fixes`](../../mock/index.html#079-ci-test-fixes)

No screen changes. The mock section notes that.

## Acceptance Criteria

1. **AC-1** `desired()` in `modules/delivery/sync/import.ts` orders a record's tasks as storage returns them (ref
   length, then ref), so a re-sync of an unchanged repo is `updated: 0` however the change.md orders its tasks. A test
   syncs a fake repo whose tasks are written `T2, T10, T1`, re-syncs it, and gets `created: 0, updated: 0`.
2. **AC-2** `modules/delivery/tests/chat.test.ts` AC-5 expects the refused role's tools to be
   `whoami, search, offer_choices`, matching 076 AC-1.
3. **AC-3** `pnpm turbo run test --filter @amax/delivery` passes against local Postgres, and the fork-PR review gate
   still exits 0 with 079's own final review round.

## Tasks

- [x] `T1` — Sync orders a record's tasks as storage does, with an out-of-order re-sync test (AC-1)
  Files: modules/delivery/sync/import.ts, modules/delivery/tests/sync-import.test.ts
- [x] `T2` — Delivery chat test expects `offer_choices` (AC-2)
  Files: modules/delivery/tests/chat.test.ts
- [ ] `T3` — Run the delivery tests on local Postgres and the review gate (AC-3)
  Files: .specclaw/changes/079-ci-test-fixes/change.md
  Depends: T1, T2

## Verify

Build notes, 2026-10-30 (verify after the review pass):

- `DATABASE_MIGRATE_URL=…:5440 pnpm turbo run test --filter @amax/delivery`: 256 passed, 1 failed. The two CI failures
  (`sync-import` re-sync, `chat` AC-5) and the new out-of-order test pass. The one failure is
  `releases.test.ts:289`, Windows-only: its `modules\/delivery\/` path regex doesn't match backslash paths. Untouched
  by 079; it passes on CI's Linux runner.
- `pnpm lint`: exit 0 (35/35).
