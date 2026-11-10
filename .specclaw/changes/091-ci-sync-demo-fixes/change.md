# The CI sync shows the repo as it is: open branches only, history as Released, one owner per key

**Change:** 091-ci-sync-demo-fixes · **Created:** 2026-11-10 · **Review:** change

**Depends on:** 090-e2e-amx-duplicate-numbers (same branch, PR #113).

## Problem

The local demo of 089's CI sync (2026-11-10) put 78 proposals in Verified on AMX: CI pushes every `specclaw/*` branch,
and a long-merged branch still says "PR raised", so finished work came back as Verified. The Released lane stayed empty:
a push never releases, so 65 archived changes were skipped, each listed on the Repo sync card. A branch push also
updated AMX-062 though `main` holds that key for a duplicate pair (089 round-5 major B1), and the self-sync takes any
`--sha` (089 round-5 major B6).

## Mock Delta

What changes on screen, and where to see it: [`091-ci-sync-demo-fixes`](../../mock/index.html#091-ci-sync-demo-fixes)

The Repo sync card groups a push's skips by reason ("two changes numbered … (3): AMX-062, AMX-074, AMX-075") instead
of one line per proposal. A first push from main lists its finished changes as created, and the board's Released lane
holds them. The CI job summary says how many merged or archived branches it left out.

## Acceptance Criteria

1. **AC-1** CI pushes only open branches. A `specclaw/*` branch is left out when its tip is already in the checked-out
   default branch (merged), or when its change folder is archived there. The job summary says so in one line ("left
   out 61 merged or archived branches"). The rest are pushed as before.

   *Build note (demo re-run, 2026-11-10):* also left out, with a warning naming the folder, is an open branch whose
   change number the default branch already uses for another folder. amax can't see the default branch's folders
   during a branch push, so AC-2 had no stored row to compare when main skips that number as a duplicate, and
   `specclaw/062-mock-unclosed-sections` created AMX-062. Its PR fails the number check (089 AC-10) anyway.
2. **AC-2** A branch push can't take over a key that the default branch holds for another folder. On a ref other than
   the default branch, a record whose stored proposal came from a different folder (`source_ref`) is skipped with
   "two changes numbered NNN: <stored folder>, <this folder>" and sets needsReview. The default branch may still
   rename a change (its push has only the new folder). The self-sync can't meet this case: it takes a branch's copy
   only of a folder that's on main.
3. **AC-3** `sync:specclaw` refuses a `--sha` that isn't 7–40 hex characters, as `sync_specclaw` does, before reading
   anything.
4. **AC-4** History as Released (agreed 2026-11-10). A push from the default branch
   creates an archived change it has never stored as Released, with the archive date as its released date. It emits no
   phase event and sends no notification. A proposal amax already has is still never moved to Released by a push:
   that stays a Prod deployment's ("released comes from Prod deployments"). A branch push never creates Released.
5. **AC-5** The Repo sync card groups a push's skip lines by reason: "<reason> (n): KEY, KEY, …", at most five keys
   and then "+n more". Needs you and the counts are unchanged.
6. **AC-6** Tests: a table per rule (merged, archived and open branches; another folder on a branch, a rename on the
   default branch; sha shapes; new archived vs existing vs on a branch; grouped skip lines), the 089 suites unchanged,
   and the AMX e2e board still matching the sync's rule.

## Tasks

- [x] `T1` — Repo sync card groups skip lines by reason, five keys then "+n more" (AC-5)
  Files: modules/delivery/ui/skips.ts, modules/delivery/ui/RepoSyncCard.tsx, modules/delivery/tests/skips-091.test.ts
- [x] `T2` — sync_specclaw: a default-branch push creates a never-seen archived change as Released history; a branch push skips a record whose stored proposal came from another folder (AC-2, AC-4)
  Files: modules/delivery/server/push.ts, modules/delivery/mcp.ts, modules/delivery/tests/sync-push-091.test.ts
- [x] `T3` — One commit-sha rule for sync_specclaw and sync:specclaw, which refuses a bad --sha before reading (AC-3)
  Files: modules/delivery/sync/sha.ts, modules/delivery/sync/bin.ts, modules/delivery/server/push.ts, modules/delivery/tests/sha-091.test.ts
- [x] `T4` — CI leaves out merged and archived specclaw/* branches and says how many (AC-1)
  Files: scripts/specclaw-sync-ci.mjs, packages/testing/tests/specclaw-sync-ci.test.ts
- [~] `T5` — Docs, the 089 suites and the AMX e2e still green (AC-6)
  Files: modules/delivery/README.md, plugins/amax/README.md, .specclaw/changes/091-ci-sync-demo-fixes/change.md
  Depends: T1–T4

## Verify

<!-- Filled by verify. -->
