# Compliance breach test clock

**Change:** 103-compliance-breach-clock · **Created:** 2026-11-12

## Problem

CI's `checks` job fails on `modules/compliance/tests/registers.test.ts` AC2 ("expected … to match object { daysLeft: 5 }",
got 6), on PR #116 and, by the date alone, on any branch. The test mixes a breach due 72 h from the real clock with the
fixtures' Payslip breach, fixed at 2026-11-15. From 2026-11-11 on, the reminder run timed off the real clock falls inside
the Payslip breach's last week, so that breach's first reminder says 6 days left instead of 5. From about 2026-11-13,
the same run marks it reminded for a later day and the 2026-11-10 run reminds nothing.

## Mock Delta

What changes on screen, and where to see it: [`103-compliance-breach-clock`](../../mock/index.html#103-compliance-breach-clock)

No screen changes. The section says so.

## Acceptance Criteria

1. **AC-1** `registers.test.ts` AC2 pins the clock (`Date` only) to the fixtures' day, 2026-10-16, and restores it after,
   so every date the test checks is fixed. Its assertions are otherwise unchanged: the 72 h deadline, the regulator, the
   reminders and `daysLeft: 5`.
2. **AC-2** The test passes today, and CI's `checks` job passes the compliance suite on PR #116.
3. **AC-3** No change to `modules/compliance/server/`, the fixtures, or any other test.

## Tasks

No UI: a test-only fix (the mock section says so).

- [x] `T1` — Pin AC2's clock (`Date` only) to 2026-10-16 and restore it when the test finishes; update its comment (AC-1, AC-2, AC-3)
  Files: modules/compliance/tests/registers.test.ts

## Verify

**Verdict:** PASS. Verified at `6e164618` on 2026-11-12. `Review: CLEAN — 2 rounds, final pass 6e16461885`.

- AC-1: pass — AC2 calls `vi.useFakeTimers({ toFake: ["Date"], now: 2026-10-16T08:00:00Z })` and restores the real
  clock in `onTestFinished`. Its assertions are unchanged (72 h deadline, regulator, reminders, `daysLeft: 5`).
- AC-2: pass on this host — before the fix the test failed locally exactly as in CI (`daysLeft` 6, expected 5); after
  it, `modules/compliance` passes 14/14. CI's `checks` on PR #116 is pending the push.
- AC-3: pass — the only code file changed is `modules/compliance/tests/registers.test.ts` (plus the two identical mock
  copies' section for 103).
- `tsc --noEmit` in `modules/compliance`: exit 0.
- Screenshot: not needed beyond the mock's text: no screen changes.

### Review loop (2026-11-12)

Scope: commits after `9aefa301` (102's last commit; this change is stacked on it). Models opus/opus.

| Round | Pass | Result |
|---|---|---|
| 1 | round | clean; 1 minor (the fixture day is written in three places) to follow-ups |
| 2 | final | clean |
