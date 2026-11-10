# The AMX e2e counts leave out the duplicate-numbered changes the sync skips

**Change:** 090-e2e-amx-duplicate-numbers · **Created:** 2026-11-10 · **Review:** change

**Depends on:** 089-specclaw-sync-over-mcp (same branch, PR #113).

## Problem

Since 089, `readSpecclaw` returns both folders of a shared number (062, 074 and 075 in this repo), and the sync skips
them. Two e2e tests in `apps/web/tests/e2e/delivery.spec.ts` still counted every record, so CI's `e2e:auth` failed on
PR #113: the AMX lanes expected 3, 0, 1, 24, 64 and the board showed 3, 0, 0, 21, 62; "in flight" expected 65 and
showed 61. The fix landed after 089's last review pass (`7111a89`), so the review gate counts it as unreviewed; it
needs a loop of its own, and 089 is at the five-pass cap.

## Mock Delta

None. Tests only; no screen changes. No section.

## Acceptance Criteria

1. **AC-1** The e2e helper `amx()` returns only the records the sync puts on the board (not `duplicate`), and the
   "039 the AMX board" test uses it for its lane counts: they match the board (3, 0, 0, 21, 62 at the time of writing).
2. **AC-2** "AC2 proposals show the phase bar" counts AMX's in-flight proposals through the same helper, so the
   "in flight" figure matches the page (61 at the time of writing).
3. **AC-3** The review gate passes on PR #113: the e2e fix's commit names this change, and this change's final pass
   comes after it.

## Tasks

- [x] `T1` — `amx()` leaves out duplicate-numbered records; the 039 test uses it (AC-1, AC-2)
  Files: apps/web/tests/e2e/delivery.spec.ts
- [ ] `T2` — Review loop for this change after the commit, then the gate on PR #113 (AC-3)
  Files: .specclaw/changes/090-e2e-amx-duplicate-numbers/change.md
  Depends: T1

## Verify

<!-- Filled by verify. -->
