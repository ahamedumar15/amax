# Release tracking, phase 1: a release has a name, a category, dates and a status

**Change:** 123-releases-and-proposal-entries · **Created:** 2026-11-26 · **Review:** change

## Problem

A release today is only a version tag on a project (`delivery.release`: `id`, `project_id`, `version`, `created_at`).
Release Tracking needs to know what a release is for and when it's due: a human-readable name, a category (Dev, UAT
or Prod), a start and target date, a status, and whether it finished on time. Adding a proposal that already sits in
another open release quietly moves it today (`assignProposals`), and any proposal can be added whatever its phase.
This is phase 1 of Release Tracking (the product owner's brief, 2026-11-26): the data, the services and their rules.
The chat card, the list and detail pages, and the daily status check are later phases.

Decisions (product owner, 2026-11-26): existing releases stay **untracked** (nullable new fields); a valid deployment
completes a release **in this phase**; a proposal in another open release is **refused, naming that release**; the
new fields are **required now** on `create_release`.

## Mock Delta

What changes on screen, and where to see it: [`123-releases-and-proposal-entries`](../../mock/index.html#123-releases-and-proposal-entries)

- No page changes. Chat's New release asks for the name, category and dates, and its confirm card shows them.
- The refusals a person can meet are shown as chat would show them.
- `get_release_history` returns the new fields and the status history (sample output).

## Acceptance Criteria

Terms. A release's **category environment** is the project's environment named like the category (`Dev`, `UAT`,
case-insensitive) or, for `Prod`, the project's Prod environment (`is_prod`). A **valid deployment** is a
`delivery.deployment` row with status `deployed`, not voided, to the category environment. **Today** and the
day of a completion are read in the project's zone: `entityZone(tx, project.legal_entity_id)` (UTC with none).
A **tracked** release has a category; one with none (every release made before this change) is **untracked**.

1. **AC-1 Schema.** Migration `0025_release_tracking.sql` adds to `delivery.release`: `name text`, `category text`
   (check `dev | uat | prod`), `start_date date`, `target_date date` (check `target_date >= start_date`), `status text`
   (check `planned | in_progress | overdue | completed`), `completed_at timestamptz`, `completion text` (check
   `on_time | late`), `completing_deployment_id uuid` (references `delivery.deployment`), and `updated_at timestamptz
   not null default now()`. All new columns are nullable; existing rows keep `version`, `id` and `created_at`, and get
   `name = version` and nothing else. A check keeps a tracked row whole (category, start, target, status and name all set).
   RLS stays forced, as for every `delivery` table.
2. **AC-2 Status history.** New table `delivery.release_status_history` (`id`, `tenant_id`, `release_id`, `from_status`
   null on create, `to_status`, `at`, `source`: `create | update | deployment | void`, `deployment_id` nullable, `by`),
   tenant RLS on, append-only (no update or delete grant to the app role). Every status a tracked release takes writes
   one row in the same transaction; a write that leaves the status as it was writes none.
3. **AC-3 Status rule.** One pure function `releaseStatus({ today, start, target, completedAt })`: `completed` when
   there's a completion, else `planned` before the start day, `overdue` after the target day, else `in_progress`.
   `completion` is `on_time` when the completion's day (project zone) is on or before the target day, else `late`.
   Unit tests cover each branch and the day boundary in a non-UTC zone.
4. **AC-4 Create.** `create_release` takes `projectKey`, `version`, `name` (trimmed, 1–120), `category`
   (`Dev | UAT | Prod`), `startDate`, `targetDate` (`YYYY-MM-DD`, real calendar days), and optional `proposalKeys`; all
   but `proposalKeys` are required in the tool and in `createRelease`. It refuses, each with a plain message: a target
   before the start; a project with no category environment ("ORB has no UAT environment"); a duplicate version (as
   today). The release is created with the AC-3 status and one history row (`source: create`). The result carries
   `id`, `status` and `href` (`releaseHref`). Audited as `delivery.release.create`, as today.
5. **AC-5 Eligible proposals.** A proposal newly put in a release (by `create_release` or `set_release_proposals`)
   must be Verified or Released; anything else is refused naming it and its phase ("ORB-050 is Building; only Verified
   or Released proposals can go in a release"). The existing refusals stay: unknown key, withdrawn, released in another
   release, release already live in Prod. A proposal already in this release keeps its place whatever its phase.
6. **AC-6 Conflicts.** A proposal that sits in another release that isn't Completed is refused, naming that release,
   its category and status ("ORB-044 is already in ORB v0.14.0 (UAT, In progress); take it out there first"). An
   untracked other release counts as open. The silent move in `assignProposals` is gone. A proposal in a Completed
   release that isn't Released can be moved.
7. **AC-7 Update.** New write tool `update_release` (`projectKey`, `version`, and any of `name`, `category`,
   `startDate`, `targetDate`; `delivery:release:create`, PM `@managed`, a confirm card listing before and after) edits
   a release. It refuses a Completed one ("ORB v0.13.0 is completed; it can't change"). Setting the category on an
   untracked release needs the name, category and both dates together, after which it's tracked. The same field
   rules as AC-4 apply. It recomputes the status (history row `source: update` when it changes), sets `updated_at`,
   and is audited `delivery.release.update` with before and after. `set_release_proposals` and `tag_release` also refuse
   a Completed release; an untracked release keeps today's behaviour for both.
8. **AC-8 Completion.** In the same locked transaction, `record_deployment` of a valid deployment to a tracked,
   uncompleted release's category environment sets `status = completed`, `completed_at` = the deployment's time,
   `completion`, `completing_deployment_id`, and a history row (`source: deployment`, `deployment_id`). Testing,
   rolled-back, and deployments to other environments don't complete it. Prod releasing proposals is unchanged.
9. **AC-9 Void reopens.** `void_deployment` of the completing deployment looks for another valid deployment to the
   category environment: the earliest one completes it instead (history `source: void`); with none, the release is
   reopened to the AC-3 status with `completed_at`, `completion` and `completing_deployment_id` cleared (history
   `source: void`). Voiding any other deployment leaves the release as it is.
10. **AC-10 Reads.** `get_release`, `get_release_history` and `list_releases` rows carry `name`, `category`, `startDate`,
    `targetDate`, `status`, `completedAt`, `completion` and `updatedAt` (null for an untracked release), and
    `get_release_history` adds `statusHistory` (oldest first). `list_releases` keeps its order and gains no filters
    (phase 3). Its `proposals` count leaves out withdrawn proposals.
11. **AC-11 Scope.** Every new or changed write is a `defineService` with `scoped(ctx, "delivery:release:create",
    project.id)`: a PM of another project, an Engineer, Finance and HR are refused; an Admin and the project's PM may.
    Reads keep `delivery:read`; a release of another tenant is never found (RLS), tested with two tenants.
12. **AC-12 Chat.** The `delivery.new-release` intent asks for the name, category and dates as well (no new card; the
    full card is phase 2), and `createReleaseCard` shows Name, Category, Start, Target and Proposals. The release pin's
    offers and every existing caller of `create_release` (fixtures, tests, the e2e) send the new fields.
13. **AC-13 Nothing else breaks.** Release pages, the release map, the board band, the portfolio's next release, In
    Prod, the CSV, the charts, pins and deployment history behave as before for untracked releases; the existing
    delivery suites (`releases.test.ts`, `release-ref.test.ts`, the portfolio and board tests) pass, plus `pnpm lint`
    (module graph) and typecheck.

## Tasks

- [ ] `T1` — Chat: New release asks for name, category, start and target; the create card shows them; an update card for `update_release` (AC-12, AC-7 card)
  Files: modules/delivery/chat.ts, modules/delivery/server/write-cards.ts, packages/ai/src/scripted-writes.ts, packages/ai/tests/scripted-writes.test.ts
- [ ] `T2` — Migration and the status rule: `0025_release_tracking.sql` (release columns, checks, `name = version` backfill, `release_status_history` with RLS and no update/delete grant) and the pure `releaseStatus` / `completionOf` in a new `server/release-status.ts`, with its unit tests (AC-1, AC-2, AC-3)
  Files: modules/delivery/db/migrations/0025_release_tracking.sql, modules/delivery/server/release-status.ts, modules/delivery/tests/release-status-123.test.ts
- [ ] `T3` — Services: `createRelease` takes and checks the new fields and the category environment, writes status and history, returns `href`; `assignProposals` refuses ineligible phases and open-release conflicts (no silent move); new `updateRelease`; `setReleaseProposals` and `tagRelease` refuse a Completed release; `recordDeployment` completes and `voidDeployment` reopens or re-completes, under the existing locks (AC-4 to AC-9)
  Files: modules/delivery/server/services.ts, modules/delivery/server/release-status.ts
  Depends: T2
- [ ] `T4` — Tools and reads: `create_release` input, new `update_release` write tool; `ReleaseRow`, `listReleases`, `getRelease` carry the new fields, `statusHistory`, and a proposal count without withdrawn ones; README and contracts note (AC-4, AC-7, AC-10, AC-11)
  Files: modules/delivery/mcp.ts, modules/delivery/server/queries.ts, modules/delivery/README.md
  Depends: T3
- [ ] `T5` — Tests and callers: DB tests for create, read, list, update, dates, category, eligibility, conflicts, completion, void, scope by role and two tenants; existing tests that call `create_release` / `createRelease` send the new fields; run the delivery, notifications and ai suites, `pnpm lint` and typecheck (AC-4 to AC-13)
  Files: modules/delivery/tests/release-tracking-123.test.ts, modules/delivery/tests/releases.test.ts, modules/delivery/tests/owner-accept-118.test.ts, modules/delivery/tests/pin-offers.test.ts, modules/delivery/tests/proposal-lifecycle.test.ts, modules/delivery/tests/stable-pins.test.ts, modules/delivery/tests/sync-import.test.ts, modules/delivery/tests/proposal-regression.test.ts, modules/notifications/tests/delivery-flow.test.ts
  Depends: T1, T4

## Verify

<!-- Filled by verify. -->
