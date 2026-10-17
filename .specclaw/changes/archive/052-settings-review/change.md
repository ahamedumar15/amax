# Settings module review and fixes

**Change:** 052-settings-review · **Created:** 2026-10-17
**Lane:** Platform · **Reviews:** [047](../archive/047-admin-end-to-end/change.md), [048](../archive/048-chat-cost/change.md), [049](../archive/049-chat-history/change.md), [050](../archive/050-immutable-trace/change.md)

## Problem

The operator asked for the module-end review of the settings and admin module (review cadence: one review per module, at most 5 rounds). 047–050 shipped without per-change review. This change holds that review's rounds and the fixes for any blocker or major it finds. The review covers everything merged after 046 (`7bbf8c2..main`).

## Mock Delta

None. Fixes only; screens stay as in 047, 048 and 050.

## Acceptance Criteria

1. **AC-1** `specclaw-review` rounds run over `7bbf8c2..HEAD`, at most 5, ending in a final pass. Round records sit in `review/`.
2. **AC-2** Every blocker and major is fixed, each with a variant test that fails without the fix, or is escalated to the operator with a proposed redesign.
3. **AC-3** Minors land in `follow-ups.md`. Typecheck, unit tests, lint and both e2e suites stay green.

## Tasks

## Verify
