# The CI sync's last fixes: an owner a person sets always stands, owner emails parse cleanly, merges by content, honest history

**Change:** 092-ci-sync-owner-and-merge-fixes · **Created:** 2026-11-10 · **Review:** covered-by 093-agent-first-proposals

**Depends on:** 091-ci-sync-demo-fixes (same branch, PR #113). Lands before #113 merges.

## Problem

091's review stopped at the five-pass cap with four majors open (`091/follow-ups.md`), two of them regressions from its
own round-4 fixes: a sync can overwrite an owner a person sets at the same moment, and CI can leave out a branch with
newer progress by comparing commit times. An Owner line ending in punctuation names nobody, and an add commit git can't
find clears an owner. The board also says "In Prod" on finished changes that came in as repo history with no Prod
deployment, and push.ts still has its own copy of the sync's skip rule (090).

## Mock Delta

What changes on screen, and where to see it: [`092-ci-sync-owner-and-merge-fixes`](../../mock/index.html#092-ci-sync-owner-and-merge-fixes)

A Released card says "In Prod" only when a Prod deployment released it (with its version); one that came in from the
repo's archive says "Released · from repo".

## Acceptance Criteria

1. **AC-1** An owner a person sets in amax always stands. Whether the sync may change the owner is decided on the
   proposal row as the upsert locks it (`owner_set_by_person`, or the repo's answer unknown), never from a read taken
   before. A real `update_proposal` and a real push run at the same time: the person's owner is the one kept.
2. **AC-2** The Owner line's email is a clean address: trailing `,` `;` `.` `)` and markdown link brackets are not part
   of it (`**Owner:** a@b.test,`, `[a@b.test](mailto:a@b.test)`, `Name <a@b.test>.`). The reader's table covers them;
   the plugin bundle is rebuilt.
3. **AC-3** When a change's `change.md` is in the tree but git finds no commit that added it, its author is unknown
   (the stored owner stays), never "nobody".
4. **AC-4** CI counts a squash- or rebase-merged branch as merged by content only: main's tree for its change folder
   equals the branch's, or the branch's last commit touching that folder is in main's history. Never by commit times.
   A branch whose folder on main is older than the branch's (a stacked PR) is pushed.
5. **AC-5** A Released card says "In Prod" (with its release) only when a Prod deployment released it; a proposal that
   came in as repo history says "Released · from repo".
6. **AC-6** push.ts decides its duplicate and unreadable skips with the sync's own `skipReason` (`sync/duplicates.ts`),
   keeping its codes, so the push and the self-sync can't drift apart. `repoOwnerStale`'s doc comment is on it.
7. **AC-7** Tests: a table per rule above; the 089, 090 and 091 suites and the AMX e2e still green.

Not in this change: renumbering one change of each pair sharing 062, 074 and 075, which needs a product decision on
which change keeps its number.

## Tasks

- [x] `T1` — A Released card says "In Prod" with its release only when a Prod deployment released it; repo history says "Released · from repo" (AC-5)
  Files: modules/delivery/ui/ProjectPage.tsx, modules/delivery/tests/board-092.test.ts
- [x] `T2` — The owner is frozen on the locked row in SQL; a concurrent update_proposal's owner stands (AC-1)
  Files: modules/delivery/server/services.ts, modules/delivery/server/owner.ts, modules/delivery/tests/owner-092.test.ts
- [x] `T3` — Clean Owner-line emails; an add commit git can't find is unknown (AC-2, AC-3)
  Files: modules/delivery/sync/specclaw.ts, modules/delivery/sync/authors.ts, plugins/amax/scripts/read-specclaw.mjs, modules/delivery/tests/owner-092.test.ts
- [x] `T4` — CI counts squash/rebase merges by content or ancestry, never time (AC-4)
  Files: scripts/specclaw-sync-ci.mjs, packages/testing/tests/specclaw-sync-ci.test.ts
- [x] `T5` — push.ts uses skipReason; doc comment on repoOwnerStale; suites and docs (AC-6, AC-7)
  Files: modules/delivery/server/push.ts, modules/delivery/sync/duplicates.ts, modules/delivery/README.md
  Depends: T1–T4

## Verify

<!-- Filled by verify. -->
