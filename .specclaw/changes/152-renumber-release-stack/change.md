# This stack's changes move to 138–151, clear of PR #133

**Change:** 152-renumber-release-stack · **Created:** 2026-11-26 · **Review:** change

## Problem

Open PR #133 (another contributor's branch, `thevinu/both-tabs`) adds change folders 116–137. This stack adds 116–129
under other names (116-github-setup-without-struggle … 129-completed-release-moves). Whichever PR merges second fails
`scripts/check-change-numbers.mjs` on fourteen duplicate numbers, and a duplicate number can't own its amax proposal key
(089). Product owner (2026-11-26): this stack moves to 138–151, the first numbers after #133's. This change is 152, so it
collides with neither.

## Mock Delta

No screen changes. The moved changes' mock sections take their new ids (anchors `#138-…` to `#151-…`). This change gets
no section of its own, because it shows nothing new (as 098).

## Acceptance Criteria

The moves, each keeping its slug: 116→138, 117→139, 118→140, 119→141, 120→142, 121→143, 122→144, 123→145, 124→146,
125→147, 126→148, 127→149, 128→150, 129→151 (e.g. `123-releases-and-proposal-entries` →
`145-releases-and-proposal-entries`).

1. **AC-1 Folders.** The fourteen folders under `.specclaw/changes/` are renamed as above. In each, the heading's
   `**Change:**` line, `state.json`'s `change` and `status.md` use the new name. History, phases, tasks, verdicts, review
   rounds, shots and evidence are otherwise unchanged.
2. **AC-2 Mock.** Each moved change's section in `.specclaw/mock/index.html` takes its new `data-change` and `id` (and
   any selector scoped to them), and so does each of the five present in `apps/mock/public/mock/index.html`. Any
   section whose `data-parent` names a moved change follows it.
3. **AC-3 Live references, not records.** Links between the moved changes' own pages (the `## Mock Delta` anchors,
   `../<name>/` links, a `**Review:** covered-by` line, a `## Verify` line naming another change it covers) use the new
   names, as does `.specclaw/STATUS.md`. Records of what already happened keep the name they had then (as 098 AC-3):
   review round files, `review-memory/findings.jsonl`, commit subjects, the change numbers in code comments, test titles
   and migration comments (`-- 126: …`), and the README's per-change notes ("(123)", "(129)"), which name the change that
   made each rule.
4. **AC-4 The review gate.** `node scripts/check-review-gate.mjs --base upstream/main --head HEAD --fork true` passes for
   the renamed stack. A change reviewed in its own loop (138–147, 149–151) passes on its own rounds, which move with it.
   148 (was 126, `covered-by 127`) can't keep that line: the gate reads a change's history by its folder path, which
   starts at the rename, and the later commits name the old folders. So 148 drops `covered-by` and gets its own final
   pass (`--final`, base 52435965, 126's base) after the rename; it has no rounds of its own, so the five-pass cap
   allows it. 152 runs its own loop too, its final pass last.
5. **AC-5 Numbers.** `node scripts/check-change-numbers.mjs --base upstream/main --head HEAD` passes, and no number this
   stack uses (138–152) is among the change folders #133 adds (read from GitHub: `gh pr view 133 --json files`), so the
   two PRs together use no number twice.
6. **AC-6 amax.** The specclaw sync's handling of a renamed folder (same slug, new number) is checked before the push:
   the build records whether the next sync re-keys AMX-116…129 to AMX-138…151 (`ProposalRekeyed`) or creates new
   proposals and withdraws the old ones, and the PR body says which.

## Tasks

No UI task: no screen changes (the mock sections only take new ids).

- [ ] `T1` — AC-1 AC-2 AC-3: one scripted rename of the fourteen folders (file moves only, no git command), their in-folder names, both mock copies' section ids and parents, the live links between the moved changes, and `.specclaw/STATUS.md`; 148's `**Review:** covered-by` line becomes `**Review:** change`; a dry-run list of every edit is checked before it runs, and a search afterwards finds no old name outside the records AC-3 keeps
  Files: .specclaw/changes/116-* … 129-* renamed to 138-* … 151-*, .specclaw/mock/index.html, apps/mock/public/mock/index.html, .specclaw/STATUS.md
- [ ] `T2` — AC-6: read how the specclaw sync treats a folder whose number changed with the same slug (re-key or new proposal), and record the answer under `## Verify` for the PR body
  Files: modules/delivery/sync/ (read only), .specclaw/changes/152-renumber-release-stack/change.md
- [ ] `T3` — AC-4 AC-5: after the rename is committed, 148's own final pass (base 52435965); the review gate and the change-number check over the stack, and no number in 138–152 among #133's folders; 152's own loop at verify
  Files: .specclaw/changes/148-release-status-engine/review/, .specclaw/changes/152-renumber-release-stack/
  Depends: T1

## Verify
