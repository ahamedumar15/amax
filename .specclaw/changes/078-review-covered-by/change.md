# Review gate: a covering loop counts

**Change:** 078-review-covered-by · **Created:** 2026-10-30 · **Review:** change

## Problem

On a stacked branch, one specclaw-review loop often reviews several changes at once: 073's loop covered the 074–077
commits its branch carries (073 `## Verify`). The fork PR's `review-gate` only reads each change's own `review/`, so
074-dev-demo-data, 075-team-time-status-band, 076-chat-choice-cards and 077-time-requests-history fail with
"no final review round (review/ has 0 rounds)", although their code was reviewed.

## Mock Delta

What changes on screen, and where to see it: [`078-review-covered-by`](../../mock/index.html#078-review-covered-by)

No app screen. The mock adds sample `review-gate` output for a fork PR on a stacked branch: one change passes on its own
loop, two pass as `covered-by` it, and one fails because the change it names has no final round.

## Acceptance Criteria

1. **AC-1** A `change.md` header can declare `**Review:** covered-by <NNN-slug>`. `reviewScope()` returns the scope
   `covered-by` and the named change; `change` and `module-end` read as before, and a missing line still means `change`.
2. **AC-2** On a fork PR, a covered-by change is judged by the named change's review rounds at the PR head, with the
   same rules as any change (final round that ran, at most five passes, no open blocker without a stop, reviewed head in
   the PR). The line reads `pass — covered by <NNN-slug>: <that change's reason>` or `fail — covered by <NNN-slug>: <reason>`.
   The named change is read from the PR head whether or not the PR touches it.
3. **AC-3** A covered-by line fails when the named change doesn't exist at the PR head, names the change itself, or
   names a change that is itself `covered-by` (no chains).
4. **AC-4** On a same-repo PR a covered-by change skips, as a `change` scope does.
5. **AC-5** `packages/testing/tests/review-gate.test.ts` covers AC-1 to AC-4; existing tests still pass.
6. **AC-6** AGENTS.md "Review scope" documents `covered-by`: use it only when the named change's loop actually reviewed
   this change's commits, and say so under that change's `## Verify`.
7. **AC-7** The headers of 074-dev-demo-data, 075-team-time-status-band, 076-chat-choice-cards and
   077-time-requests-history declare `**Review:** covered-by 073-time-workflow-enhancements`, and
   `node scripts/check-review-gate.mjs --base upstream/main --fork true` exits 0 on this branch.

## Tasks

- [x] `T1` — Gate reads `covered-by` and judges by the named change's rounds (AC-1, AC-2, AC-3, AC-4)
  Files: scripts/review-gate/rules.mjs, scripts/check-review-gate.mjs
- [x] `T2` — Tests for covered-by pass, missing, self, chain and same-repo skip (AC-5)
  Files: packages/testing/tests/review-gate.test.ts
  Depends: T1
- [x] `T3` — Document `covered-by` in AGENTS.md "Review scope" (AC-6)
  Files: AGENTS.md
- [x] `T4` — Declare `covered-by 073-time-workflow-enhancements` on 074–077 and run the gate on this branch (AC-7)
  Files: .specclaw/changes/074-dev-demo-data/change.md, .specclaw/changes/075-team-time-status-band/change.md, .specclaw/changes/076-chat-choice-cards/change.md, .specclaw/changes/077-time-requests-history/change.md
  Depends: T1

## Verify

Build notes, 2026-10-30 (verify not yet run):

- Built on `specclaw/073-time-workflow-enhancements`, uncommitted (git is read-only for the agent; no build branch).
- Tests: `review-gate.test.ts` (4) and `review-gate-covered.test.ts` (3) pass; shared git fixture moved to
  `review-gate-fixture.ts` to stay under 80 lines. Other `@amax/testing` files fail to import `@amax/core/env`
  (workspace packages not built locally), unrelated.
- `pnpm lint`: 35/35. `specclaw-preset-check .`: no hits in 078 files. Quality: `specclaw-quality-scan` not_run
  (jq "Argument list too long", as in 066–074).
- AC-7 on the working tree (gate rules over the uncommitted change files, fork mode): 070–077 pass, exit 0.
  `check-review-gate.mjs` reads `HEAD`, so it confirms only once committed.
- Open: once committed, 078 is itself a touched change on a fork PR and needs its own specclaw-review final round.
  073's loop didn't review it, so `covered-by` doesn't apply.
