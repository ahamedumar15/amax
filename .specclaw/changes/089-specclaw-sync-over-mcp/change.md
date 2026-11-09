# Merges reach the board on their own: CI syncs specclaw through `sync_specclaw`, and duplicate numbers are caught

**Change:** 089-specclaw-sync-over-mcp · **Created:** 2026-11-09 · **Review:** change

**Depends on:** 088-notifications-tests-quiet-hours (same branch, PR #113). First step of agentic proposals (the
client's priority, 2026-11-09): a specclaw change merged to the default branch must appear on the amax board with no
one pushing by hand.

## Problem

The CI sync (`.github/workflows/specclaw-sync.yml`, 039) writes straight to amax's database and needs
`AMAX_SYNC_DATABASE_URL`. Those secrets were never set, so every run skips at its gate (`run=false`, latest run
2026-11-02) and still shows green. Today a proposal reaches amax only when someone runs `/amax:sync-specclaw` by hand.
The direct path also bypasses the checks `sync_specclaw` makes (linked repo, a person on the project, no step back, no
stale commit).

Two change folders can share a number: `main` already has `074-dev-demo-data` and `074-fork-pr-review-gate`, and
`075-amaxerp-url` and `075-team-time-status-band`. `readSpecclaw` keys records by number, so one change of each pair
silently never reaches amax. Agents drafting on parallel branches will make this routine.

## Mock Delta

What changes on screen, and where to see it: [`089-specclaw-sync-over-mcp`](../../mock/index.html#089-specclaw-sync-over-mcp)

The Repo sync page lists CI pushes like any other push: by the credential, acting for the PM ("amax CI · for <PM>").
A duplicate number shows as a skip line that needs a person ("two changes numbered 074"), and a change folder removed
from the default branch shows as withdrawn. The section also shows the CI job's summary.

## Acceptance Criteria

### CI pushes through the tool

1. **AC-1** `specclaw-sync.yml` calls `POST /api/v1/tools/sync_specclaw` with a bearer API key and the
   `amax-act-for` header. It no longer uses `AMAX_SYNC_DATABASE_URL`, `AMAX_SYNC_TOKEN` or `AMAX_SYNC_AUDIT_HASH_KEY`.
   Its secrets are `AMAX_URL`, `AMAX_SYNC_API_KEY` and `AMAX_SYNC_ACT_FOR` (the PM's user id). The payload is built by
   the plugin's own reader (`plugins/amax/scripts/read-specclaw.mjs`), so CI and the plugin can't read a repo
   differently.
2. **AC-2** A push to the default branch that touches `.specclaw/**` sends one push for the default branch (every
   change). Then it sends one push per `specclaw/*` branch with that branch's ref, sha and commit time, which covers
   only its own change (062's rule). This replaces 039's overlays. Batches hold at most 200 records (`MAX_PUSH`).
3. **AC-3** CI applies a push even when `needsReview` is true. It prints every skip line in the job summary and as a
   warning annotation. The push's row on the Repo sync card is where a person sees it.
4. **AC-4** No silent green. With no secrets, the job ends neutral with a notice saying the sync is not configured,
   and names the three secrets. With secrets, a refused push (wrong repo, not linked, no permission) or an HTTP error
   fails the job, and its message is the refusal's reason. A failed sync still never blocks a merge: the workflow runs
   after the push to the default branch.
5. **AC-5** The credential needed is documented in `plugins/amax/README.md` and `modules/delivery/README.md`:
   - created in amax chat with `create_api_credential`, `tools: ["sync_specclaw"]`, scope `delivery:write`, and
     `actsFor` set to the project's PM;
   - every push is recorded as the credential acting for that PM, which is rule 4.

### Withdrawal through the tool

6. **AC-6** A push from the project's default branch withdraws a specclaw proposal whose change folder is gone (sets
   `meta.withdrawn`, never deletes), but only when all of these hold:
   - the proposal was last synced from the default branch (its `meta.source` ref is the default ref);
   - no newer commit has synced the proposal (its `synced_commit_at` isn't after the push's commit: push.ts's stale
     rule);
   - the proposal isn't Released.

   A proposal created by a branch push stays put until its change lands on the default branch. A stale developer
   checkout can't withdraw anything, because its commit is older.

   *Build note (T3):* the push asks for it with `withdrawMissing: true`, which is off by default. Pushes go in batches
   of 200, and one batch can't tell a gone folder from the next batch. So CI sets it only when the whole default branch
   fits in one push, and otherwise warns that withdrawal was skipped. The plugin never sets it, so its behaviour is
   unchanged (AC-11).

   *Review round 1:* the rule is one function for the push and the self-sync (`sync/withdraw.ts`, `planWithdrawals`;
   the self-sync covers any ref, since it reads main and every specclaw branch at once). A sync that read no changes,
   or that would withdraw more than half of the live proposals (and more than two), withdraws nothing and flags it
   for a person: an unreadable or wrong checkout looks the same as "every folder was deleted". CI also stops, without
   pushing, when it reads no changes on `main`.

   *Review round 2:* the cap counts only proposals the sync could withdraw (not Released, not synced from another
   ref), so a long release history doesn't raise it. A person confirms a real mass deletion with `confirmWithdraw:
   <the held count>`; in CI, by running the specclaw sync workflow by hand with its `confirm_withdraw` input. A wrong
   count stays held, and a sync that read nothing can't be confirmed. The number check (AC-10) leaves out folders the
   PR itself renamed or removed (found with the merge base).
7. **AC-7** A withdrawn count shows in the preview and the result (`withdrawn`). The plugin's summary line prints it
   too. A preview never writes, as today.

### Duplicate numbers

8. **AC-8** `readSpecclaw` keeps every folder. When two folders in one source share a number, it returns one record
   per folder, each marked `duplicate: true`, instead of keeping one. An overlay copy of the same folder name is still
   the same change, not a duplicate.
9. **AC-9** `sync_specclaw` and `syncSpecclaw` skip every duplicate-numbered record with "two changes numbered
   <NNN>: <dir>, <dir>", leave that key's stored proposal untouched (no update, no withdrawal), and set `needsReview`.
   The rest of the push applies.
10. **AC-10** A new CI check (`scripts/check-change-numbers.mjs`, a step in `ci.yml`'s pull-request `review-gate` job,
    which already has the base and head commits) fails a PR that adds a change folder whose number is already used in
    the base branch's `.specclaw/changes` or `archive`, or used twice in the PR. Pairs already on the base branch (062,
    074, 075) are reported but don't fail the check.

### Kept

11. **AC-11** The plugin path is unchanged for people: `/amax:sync-specclaw` previews and applies as before. The
    bundled reader is rebuilt (`pnpm build:plugin`), and `plugins/amax/tests/reader.test.ts` passes.
12. **AC-12** `pnpm --filter @amax/delivery sync:specclaw` (`sync/bin.ts`) still works for a self-hosted amax that
    prefers the direct path, and gains the same duplicate rule (AC-9). The workflow no longer calls it.
13. **AC-13** Tests:
    - **Unit:** the duplicate rule in the reader (incl. an overlay of the same folder); the skip and needsReview; the
      withdrawal table (default branch vs branch, newer vs older commit, Released, last synced from a branch); the
      number check against a fixture base.
    - **Workflow script:** with a fake server, not configured gives neutral, refused fails, and applied prints the
      summary.
    - All in the Linux CI replica.

## Tasks

- [x] `T1` — Repo sync shows CI pushes as the mock does: withdrawn count in each push's result, a "Needs you" chip on an applied push that needs a person, CI's push "by" line as the credential for the PM (Mock Delta, AC-7)
  Files: modules/delivery/db/migrations/0020_sync_push_withdrawn.sql, modules/delivery/server/repo-sync.ts, modules/delivery/ui/RepoSyncCard.tsx, modules/delivery/tests/board-a4.test.ts
- [x] `T2` — The reader keeps both folders of a duplicate number, each marked `duplicate`; an overlay of the same folder is the same change; the plugin bundle is rebuilt (AC-8, AC-11)
  Files: modules/delivery/sync/specclaw.ts, plugins/amax/scripts/src/read-specclaw.ts, plugins/amax/scripts/read-specclaw.mjs, plugins/amax/tests/reader.test.ts, modules/delivery/tests/sync-parse.test.ts
  Depends: —
- [x] `T3` — `sync_specclaw` and `syncSpecclaw` skip duplicate numbers (found by number in the push, whatever the client flags) and set needsReview; a default-branch push withdraws a gone folder under AC-6's three conditions; `withdrawn` in preview and result, stored with `needs_review` on the push row (AC-6, AC-7, AC-9, AC-12)
  Files: modules/delivery/server/push.ts, modules/delivery/sync/import.ts, modules/delivery/mcp.ts, modules/delivery/tests/sync-push.test.ts, modules/delivery/tests/sync-import.test.ts
  Depends: T1, T2
- [x] `T4` — CI pushes through the REST tool: a script reads with the plugin's reader, pushes main then each `specclaw/*` branch in batches of 200 with bearer key and `amax-act-for`, applies with needsReview, writes the job summary and warnings; neutral notice when not configured, failure on refusal or HTTP error; the workflow drops the database secrets (AC-1 to AC-4)
  Files: scripts/specclaw-sync-ci.mjs, .github/workflows/specclaw-sync.yml, packages/testing/tests/specclaw-sync-ci.test.ts
  Depends: T2, T3
- [x] `T5` — CI check that a PR's new change folder doesn't reuse a number from the base branch or another folder in the PR; existing base pairs reported, not failed (AC-10)
  Files: scripts/check-change-numbers.mjs, .github/workflows/ci.yml, packages/testing/tests/change-numbers.test.ts
  Depends: —
- [x] `T6` — Docs: the credential to create and the three secrets; the plugin summary prints withdrawn; delivery README on CI pushes, withdrawal and duplicates (AC-5, AC-7)
  Files: plugins/amax/README.md, plugins/amax/skills/sync-specclaw/SKILL.md, modules/delivery/README.md
  Depends: T3, T4
- [x] `T7` — Tests pass in the Linux CI replica: delivery, plugin reader, scripts (AC-13)
  Files: .specclaw/changes/089-specclaw-sync-over-mcp/change.md
  Depends: T1–T6

## Verify

Quality: not_run (`specclaw-quality-scan`: jq "Argument list too long" on this Windows host, as in 081)

**Linux CI replica (2026-11-09, working tree of `249b7e21`):** node:24-bookworm + fresh postgres:16-alpine, the
`checks` job's steps. Migrate ✅ (79, incl. `0020_sync_push_withdrawn`), lint ✅ (35/35, graph ok), `turbo run test
--force` ✅ (35/35 packages), module standard ✅ (22), build ✅. `AMAX_TEMPORAL_TESTS=0` (Temporal tests skipped).
e2e: **not_run**. Playwright's browser download didn't finish inside Docker on this network: a Debian mirror error,
then 46 minutes stuck at 10%, then three 10-minute tries that reached 30%. CI on the PR runs the full e2e suite. Only
`delivery.spec.ts` covers the changed screen (062 AC-10, the Repo sync rows); its fixture rows have
`needs_review = false`, so they still read "Applied".

Local (Windows): delivery 390/392; the two failures are host-only (`releases` backslash paths, and
`create-project-surfaces` under load, which passes alone). Scripts and plugin reader 30/30.
