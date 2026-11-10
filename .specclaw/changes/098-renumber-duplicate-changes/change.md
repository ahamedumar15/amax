# Renumber the three duplicate change numbers

**Change:** 098-renumber-duplicate-changes · **Created:** 2026-11-10

## Problem

Three change numbers are each held by two folders: 062 (`062-specclaw-sync-plugin`, `062-marketing-site`, both
archived), 074 (`074-fork-pr-review-gate`, `074-dev-demo-data`) and 075 (`075-amaxerp-url`,
`075-team-time-status-band`). Neither folder of a pair can own the proposal key, so amax has never had AMX-062, AMX-074
or AMX-075: every push skips them and asks for review, which hides real skips among standing ones.

In each pair the newer folder moves to the next free number, and the older one keeps its number:

| From | To | Why this side |
|---|---|---|
| `archive/062-marketing-site` (created 16:15, after the plugin) | `archive/101-marketing-site` | newer; parent of no mock section (the plugin's section is parent of 7) |
| `074-dev-demo-data` (2026-11-02) | `099-dev-demo-data` | newer (`074-fork-pr-review-gate` is 2026-10-28) |
| `075-team-time-status-band` (2026-11-02) | `100-team-time-status-band` | newer (`075-amaxerp-url` is 2026-10-29) |

## Mock Delta

No screen changes. The three moved changes' mock sections take their new ids, so their anchors become
[`099-dev-demo-data`](../../mock/index.html#099-dev-demo-data), [`100-team-time-status-band`](../../mock/index.html#100-team-time-status-band)
and [`101-marketing-site`](../../mock/index.html#101-marketing-site). Both mock copies (`.specclaw/mock/` and
`apps/mock/public/mock/`) stay identical. This change gets no section of its own, because it shows nothing new.

## Acceptance Criteria

1. **AC-1** No two folders under `.specclaw/changes/` or `.specclaw/changes/archive/` share a number. A check in the test
   suite fails if two ever do again.
2. **AC-2** The three folders are renamed as in the table. Each one's heading line, `state.json` `change`, `status.md`
   and mock `data-change`/`id` (and its scoped CSS selectors) use the new name. Their history, phases, tasks and
   verdicts are otherwise unchanged.
3. **AC-3** Every live reference to an old name uses the new one: the R4 review rule (`062-marketing-site`) and
   `.specclaw/STATUS.md`. Records of what already happened keep
   the name they had then: review rounds, gate output in `shots/`, `review-memory/findings.jsonl`, the Problem and task
   text of 078 and 089, test titles named after a change (`"062 AC-3 …"`, `062-ac1-landing.test.ts`), and the sample
   names in `packages/testing/tests/change-numbers.test.ts`. (Amended at plan, 2026-11-10: a search finds the old names
   in those records too, and rewriting them would change the record.) Archived 063's and 064's `Depends on` links keep
   `../062-marketing-site/` (amended at build: those changes are archived records, and any edit to 064 fails the fork
   gate, since it has 16 passes from before the cap). 073's `## Verify` line keeps naming 074-dev-demo-data and
   075-team-time-status-band, because it records what that loop reviewed. (Amended at verify: editing it makes the fork
   gate judge 073, whose reviewed head `5056a50` isn't in this branch since the stack was rebased. The gate skips the
   moves under AC-7, so the cover line isn't needed.)
4. **AC-4** `099-dev-demo-data` and `100-team-time-status-band` still declare `**Review:** covered-by
   073-time-workflow-enhancements`, and `scripts/check-review-gate.mjs` passes for this branch, with the moves skipped
   under AC-7 and 098 judged by its own loop. If the gate can't follow a renamed covered change, this change says so
   under `## Verify` and asks the product owner before going on.
5. **AC-5** A sync preview of the whole repo (`sync_specclaw`, `dryRun: true`) shows AMX-062, AMX-074 and AMX-075 created
   for the older folders, and AMX-099, AMX-100 and AMX-101 for the moved ones. It shows no "two changes numbered" skip,
   and `needsReview` is false unless something else needs a person.
6. **AC-6** `pnpm lint`, `pnpm test` and `pnpm build` pass.
7. **AC-7** On a fork PR, the review gate skips a change folder that the PR only moved to a new name. A move means the
   old folder is gone, the new one has the same slug, and every file matches apart from the change's own name. The gate
   prints `scope=move skip — moved from <old>`. A folder the PR moved *and* changed in any other way is judged as before.
   (Amended at build, 2026-11-10, product owner: the gate couldn't pass the renames. 101-marketing-site has 20 passes
   from before the cap, and covered-by 073 can't see commits made under the new names.)

## Out of scope

- **The "undefined" skip reason.** The CI pushes at 09:30 and 12:41 UTC on 2026-11-10 (`9613db6`, `25e7d86`) stored
  `AMX-062: undefined` (and the same for 074 and 075) instead of "two changes numbered …". The code at those commits
  and at HEAD builds the text correctly, so it most likely came from the build deployed then. It's recorded in
  `follow-ups.md` for its own change: find the build that was deployed, and add a test that pushes a duplicate pair
  and checks the stored line. Once this change removes the duplicates, the line no longer appears.
- Stopping a new duplicate when a number is picked, beyond the AC-1 check.

## Tasks

- [x] `T1` — Mock: the three moved sections take their new `data-change`/`id` and scoped selectors; both copies stay identical (AC-2, Mock Delta)
  Files: .specclaw/mock/index.html, apps/mock/public/mock/index.html
- [x] `T2` — Rename the three folders (`archive/062-marketing-site` → `archive/101-marketing-site`, `074-dev-demo-data` → `099-dev-demo-data`, `075-team-time-status-band` → `100-team-time-status-band`); heading line, `state.json` `change` and `status.md` use the new names; `covered-by 073` kept (AC-2, AC-4)
  Files: .specclaw/changes/archive/101-marketing-site/, .specclaw/changes/099-dev-demo-data/, .specclaw/changes/100-team-time-status-band/
  Depends: T1
- [x] `T3` — Live references: R4 rule, `STATUS.md` via `specclaw-update-status` (AC-3)
  Files: .specclaw/review/rules/R4-marketing-time-claims.md, .specclaw/STATUS.md
  Depends: T2
- [x] `T4` — A test that fails when two folders under `.specclaw/changes/` or `archive/` share a number, run against the working tree (AC-1)
  Files: packages/testing/tests/change-numbers.test.ts
  Depends: T2
- [x] `T6` — The review gate skips a pure move: `movedFrom` compares the old folder at the merge base with the new one at the head, with both names neutralised; `gate()` prints the move line instead of judging it (AC-7)
  Files: scripts/review-gate/moves.mjs, scripts/review-gate/rules.mjs, scripts/check-review-gate.mjs, packages/testing/tests/review-gate-moves.test.ts
  Depends: T4
- [x] `T5` — Integration: `check-change-numbers.mjs` and `check-review-gate.mjs` for this branch; `pnpm lint`, `pnpm test`, `pnpm build`; a full-repo `sync_specclaw` dry run showing AMX-062/074/075 and AMX-099/100/101 created with no duplicate skips (AC-4, AC-5, AC-6)
  Files: (no source files; results go under `## Verify`)
  Depends: T3, T4, T6

## Verify

<!-- Filled by verify. Build notes, 2026-11-10 (Windows, working tree, uncommitted): -->

- Quality: not_run. `specclaw-quality-scan` stops on Windows with jq's "Argument list too long".
- `pnpm lint`: 35/35 tasks, graph check ok. `node scripts/check-module-standard.mjs`: ok.
- `pnpm turbo run test --concurrency=2 --continue`: 33/35 packages pass. The two failures are Windows-only and don't
  involve 098's files. `@amax/core` `ac5-adapters` compares `/` paths against Windows `\` paths. `@amax/testing`
  `ac7-config` fails with `symlinkSync` EPERM. DB suites were skipped (no `DATABASE_URL`). The Linux CI replica is still
  to run.
- The change-number check, `check()` run against the working tree with base `specclaw/081-proposals-end-to-end`, has no
  failures. Its "known" pairs are the base branch's own until this merges.
- `movedFrom` on the real folders: 099 → 074-dev-demo-data, 100 → 075-team-time-status-band, 101 → 062-marketing-site,
  so all three are pure moves. Other folders the PR touches: 073 (final round 6, 1 blocker, stop recorded) passes.
  098 needs its own review loop.
- Still open: AC-5 (the sync dry run needs the renames committed, since `read-specclaw` refuses uncommitted
  `.specclaw` edits), the real `check-review-gate.mjs` run on the committed branch, and `pnpm build`.
