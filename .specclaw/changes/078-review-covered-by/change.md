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
   names a change that is itself `covered-by` (no chains). Amended after review round 2 (blocker: an old archived
   change could cover anything), it also fails when: the named change's `## Verify` doesn't name this change; its final
   pass is already in the PR's base; its final pass ran before every commit that touches this change's dir (active or
   archive); any PR commit after that final pass touches files outside `.specclaw/`, isn't a merge, and its subject
   names neither the covering change nor another change in the PR whose own final pass descends from it; or this
   change has review rounds of its own that ran. The scope is read from
   the header only, and `covered-by` takes its name from the same line.
4. **AC-4** On a same-repo PR a covered-by change skips, as a `change` scope does.
5. **AC-5** `packages/testing/tests/review-gate-covered.test.ts` covers AC-1 to AC-4, each AC-3 failure as a row of a
   variant table; `review-gate.test.ts` still passes.
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

**Verdict:** FAIL

Verified 2026-10-30 at `fa72929f`.

- AC-1: pass — `reviewScope()` returns `{ scope, by }`; `change`, `module-end` and a missing line read as before (074 tests
  unchanged and passing); `covered-by 101-cover` parses (`review-gate-covered.test.ts` AC1 AC2).
- AC-2: pass — a fork PR judges `103-stacked` by archived `101-cover`'s rounds, which the PR doesn't touch: "pass — covered
  by 101-cover: final round 1/5 clean" (test AC1 AC2).
- AC-3: pass — missing, unnamed, self and chained `covered-by` each fail with their reason (test AC3).
- AC-4: pass — same-repo PR skips a covered-by change (test AC4).
- AC-5: pass — `review-gate.test.ts` 4/4 and `review-gate-covered.test.ts` 3/3; shared fixture in `review-gate-fixture.ts`.
- AC-6: pass — AGENTS.md "Review scope" and `.specclaw/context.md` (Constraints) document `covered-by`, its honesty rule
  and no chains.
- AC-7: fail — `node scripts/check-review-gate.mjs --base upstream/main --fork true` exits 1. 070–077 pass (074–077 as
  covered by 073), but 078 itself fails: "no final review round (review/ has 0 rounds)". 073's loop didn't review 078,
  so it needs its own specclaw-review loop. Output: `shots/gate-output.txt`.

Commands:

- `pnpm build`: exit 0. `pnpm lint`: exit 0 (35/35). `node scripts/check-review-gate.mjs … --fork false`: exit 0.
- `pnpm turbo run test --filter @amax/testing`: exit 1, 34 passed, 4 failed, none in 078 files: `ac7-config` ×3 EPERM
  creating symlinks (Windows without symlink rights), `ac3-boundaries` ×1 5 s timeout on this host.
- `specclaw-preset-check .`: exit 1 from the repo-wide backlog; none in 078 files.
- `specclaw-quality-scan . --gate`: exit 126, not_run (jq "Argument list too long", as in 066–074).
- Screenshots: no app UI. `specclaw-screenshot` failed (Playwright not installed); mock at
  `.specclaw/mock/index.html#078-review-covered-by` not yet compared by eye.
- specclaw-review: not installed on this host.

To pass: run a specclaw-review loop on 078 (commit its `review/round-N.json`), compare the mock by eye, re-verify.
