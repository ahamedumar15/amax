# Cap the local review loop at five passes per change

**Change:** 065-review-pass-cap · **Created:** 2026-10-18
**Lane:** Platform · **Module:** `AGENTS.md` (agent guide) · **Depends on:** none

## Problem

The specclaw-review loop has no round cap, and it only stops when a round comes back clean. On 062 (21 rounds) and 064 (about 20 rounds), the loop kept finding one more case of the same class of finding, and each round cost time without changing what shipped. The product owner asked for a hard limit of five review passes per change.

## Mock Delta

No screen change.

## Acceptance Criteria

1. **AC-1** `AGENTS.md` states the rule. A change gets at most five review passes (rounds and final passes; a round that returns not_run doesn't count). After the fifth, the agent stops the loop, records the open findings and the stop under `## Verify`, and goes to the PR. It asks the product owner first if a blocker is still open.

## Tasks

- [ ] `T1` — Add the five-pass rule to the "Every change goes through specclaw" section of AGENTS.md (AC-1)
  Files: AGENTS.md

## Verify
