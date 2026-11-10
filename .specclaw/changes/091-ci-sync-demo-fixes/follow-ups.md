# Follow-ups

Deferred by the review loop: minors and pre-existing findings.

- [minor B4] `modules/delivery/sync/import.ts:58` The rule for which email names the owner (`r.owner ?? r.author ?? null`) is written twice: in `desired()` at line 28 and again in the staleness pre-pass. Make it one helper so the staleness check and the write can't drift apart. (round 1) <!-- fp:9c92bbbceaff -->
- [minor B4] `modules/delivery/sync/authors.ts:18` The shallow-clone check is written twice: inline in `authorsOf` (line 18) and again as `isShallow` (line 33). Both copies treat a failure as shallow today, but a later edit to one won't reach the other. Have `authorsOf` call `isShallow(root)`. (round 2) <!-- fp:8854b92d9fac -->
- [minor B3] `modules/delivery/sync/authors.ts:25` When `git log` succeeds but finds no commit that added the change.md, the author is `null` ('the repo names nobody'), and the sync then clears the stored owner. The self-sync (`bin.ts`) never checks that the working tree it reads matches `--sha`. So a folder that is in the tree but not committed at that sha reads as 'nobody', not as 'unknown'. Return `undefined` when the path isn't in the tree at `at` (for example, check first with `git cat-file -e <at>:<path>`). (round 2) <!-- fp:d29b921cf620 -->
