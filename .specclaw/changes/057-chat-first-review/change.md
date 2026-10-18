# Chat-first sweep review and fixes

**Change:** 057-chat-first-review · **Created:** 2026-10-17
**Lane:** Delivery

## Problem

Reviews [054](../054-chat-first-everywhere/change.md), which is merged. The review cadence calls for one review per module, at the end, capped at 5 rounds. 054 finished the chat-first sweep across time, allocations, delivery and presales. This change holds that review's rounds and the fixes for its blockers and majors. Scope: `4d42ff5..main`, which is #47.

## Mock Delta

None. Fixes only.

## Acceptance Criteria

1. **AC-1** `specclaw-review` rounds run over `4d42ff5..HEAD`: at most 5 in total, including the final pass. Round records are kept in `review/`.
2. **AC-2** Every blocker and major is fixed, each with a variant test that fails without the fix. Any that can't be fixed is escalated with a proposed redesign, or recorded as open after the cap.
3. **AC-3** Minor findings go in `follow-ups.md`. Typecheck, unit tests, lint and both e2e suites stay green.

## Tasks

## Verify

- Rounds: 1 exit 1 (6 majors), 2 exit 1 (2), 3 exit 1 (3), 4 exit 1 (2), 5 `--final` exit 4 (escalate, 6 majors). Cap reached.
- Fixed with table-driven tests: Team time prompts by week id, get_allocation namesakes, update_opportunity owner link, row pins to one record (proposal, environment, deployment), re-tag URL follow, one release ref rule.
- Open after the cap, with a proposed redesign: `follow-ups.md`, "Open after the 5-round cap".
- Typecheck, lint and graph check, unit tests (all packages), `e2e`, `e2e:auth` (49) and the time e2e pass at d74edcf.
