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
3. **AC-3** Every other reference to an old name uses the new one. That covers the R4 review rule (`062-marketing-site`),
   073's `## Verify` line that names 074 and 075 as covered, and any code or doc reference. A search for the three old
   names finds them only in git history and this change's own text.
4. **AC-4** `099-dev-demo-data` and `100-team-time-status-band` still declare `**Review:** covered-by
   073-time-workflow-enhancements`, and `scripts/check-review-gate.mjs` passes for this branch. If the gate can't
   follow a renamed covered change, this change says so under `## Verify` and asks the product owner before going on.
5. **AC-5** A sync preview of the whole repo (`sync_specclaw`, `dryRun: true`) shows AMX-062, AMX-074 and AMX-075 created
   for the older folders, and AMX-099, AMX-100 and AMX-101 for the moved ones. It shows no "two changes numbered" skip,
   and `needsReview` is false unless something else needs a person.
6. **AC-6** `pnpm lint`, `pnpm test` and `pnpm build` pass.

## Out of scope

- **The "undefined" skip reason.** The CI pushes at 09:30 and 12:41 UTC on 2026-11-10 (`9613db6`, `25e7d86`) stored
  `AMX-062: undefined` (and the same for 074 and 075) instead of "two changes numbered …". The code at those commits
  and at HEAD builds the text correctly, so it most likely came from the build deployed then. It's recorded in
  `follow-ups.md` for its own change: find the build that was deployed, and add a test that pushes a duplicate pair
  and checks the stored line. Once this change removes the duplicates, the line no longer appears.
- Stopping a new duplicate when a number is picked, beyond the AC-1 check.

## Tasks

<!-- Added by plan. -->

## Verify

<!-- Filled by verify. -->
