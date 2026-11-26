# Release tracking, phase 4: release status keeps itself up to date, and Completed is final

**Change:** 126-release-status-engine · **Created:** 2026-11-26 · **Review:** change

## Problem

Since 123 a release's status follows one rule (`releaseStatus`), recalculated on create, edit and deployment. Nothing
moves it when only the calendar changes, so a release stays Planned after its start day and never turns Off track after
its target day until someone writes to it. The phase 4 brief (product owner, 2026-11-26) also asks for a `failed`
deployment that never completes a release, and for Completed to be final.

Decisions (product owner, 2026-11-26), which amend 123's AC-9: **Completed is final**: voiding the deployment that
completed a release no longer reopens it; the page says the record was voided. **Add `failed`** as a deployment status.
Already in place and kept (123): the release-to-deployment link (`deployment.release_id`), the category-to-environment
mapping (Dev and UAT by name, Prod by the project's `is_prod` environment), completion evidence, the inclusive target day,
and history rows only on a change.

## Mock Delta

What changes on screen, and where to see it: [`126-release-status-engine`](../../mock/index.html#126-release-status-engine)

- A release's status history shows "Start date reached" and "Target date passed" rows written by amax.
- A `failed` deployment shows with the bad tone and never completes the release.
- A completed release whose completing deployment was voided keeps Completed and says so.
- Settings → Workflows lists "Release status check", hourly.

## Acceptance Criteria

Terms as in 123. **Unsuccessful**: a deployment whose status is `rolled-back` or `failed`.

1. **AC-1 Failed status.** Migration `0026_release_status_engine.sql` widens `delivery.deployment.status` to
   `deployed | testing | rolled-back | failed` and `release_status_history.source` to add `schedule`.
   `record_deployment` accepts `failed`; the `ReleaseDeployed` contract's status gains `failed` (additive, README). A
   failed record never completes a release and never releases proposals.
2. **AC-2 One rule for unsuccessful.** A shared `unsuccessful(status)` (`server/deployment-status.ts`) is what the map's
   pill ("Failed Wed Oct 14", as for a rollback), the next step ("Retry UAT"), the progress track (✕ "failed"), the
   deployment chip (bad tone, "failed"), the board band, the Overview's rolled-back count, the portfolio's next-release
   stage and the pin offers' retry use; every place that read `rolled-back` alone reads it. A failed deployment
   notifies the project's PMs like a rollback (rule `delivery.release-failed`).
3. **AC-3 Completed is final.** Once a release is Completed nothing changes its status, completion time, on-time or late,
   or completing deployment: not a later rollback or failure (already true), and not voiding the completing deployment
   (amends 123 AC-9: no history row, no reopening). `get_release_history` adds `completingVoided` (the void's time and
   reason, or null), and the release page says "The deployment that completed this release was voided on <date>:
   <reason>. The release stays completed."
4. **AC-4 The scheduled check.** A workflow `delivery.release-status` with an hourly UTC schedule (`0 * * * *`, enabled)
   evaluates every tracked release that isn't completed, in every tenant: it works out today in the release's project zone
   (AC-6) and applies `releaseStatus`. A change writes the status and one history row (`source: schedule`, by amax);
   the run is one audited write per tenant (`delivery.release.evaluate`, `after.changed`: version, from, to) and its
   summary says "<n> releases moved". It's listed in Settings → Workflows.
5. **AC-5 Idempotent and safe.** Running the check twice in a row changes nothing the second time and writes no second
   history row. Each release row is locked while it is evaluated, and a release a deployment completed meanwhile is left
   alone, so the check never overwrites Completed.
6. **AC-6 Timezone.** The day is the project's legal entity zone (`entityZone`: the entity's own zone, else its
   country's default) and UTC for a project with no legal entity or no zone; the tenant's `delivery.clock_pin` applies,
   as everywhere in Delivery. The README says so.
7. **AC-7 Reasons in the history.** The status history's Why reads "Start date reached" (to In progress) or "Target date
   passed" (to Off track) for a scheduled change, by "amax".
8. **AC-8 Tests.** Planned, In progress and Off track by date; on-time and late completion (target day inclusive, project
   zone); the matching environment completes, another doesn't; failed, testing and rolled-back don't; voiding the
   completing deployment keeps Completed; a rollback after completion keeps it; the check run twice writes once; the
   check leaves a release completed meanwhile alone; deployment history and the existing release suites still pass.

## Tasks

- [ ] `T1` — UI: the one `unsuccessful` rule on every screen that read `rolled-back` (map pill, next step, progress track, deployment chip, board band); the "completing deployment voided" line on the release page; the history's Why for scheduled changes (AC-2 UI side, AC-3 page, AC-7)
  Files: modules/delivery/server/deployment-status.ts, modules/delivery/ui/ReleasesPage.tsx, modules/delivery/ui/ReleaseTable.tsx, modules/delivery/ui/ReleaseDeployments.tsx, modules/delivery/ui/ReleaseHistory.tsx, modules/delivery/ui/ReleasePage.tsx, modules/delivery/ui/BoardBand.tsx, modules/delivery/ui/band.ts
- [ ] `T2` — Data and services: migration 0026 (`failed`, `schedule`); `record_deployment` and the contract accept `failed`; Overview, portfolio and pin offers use `unsuccessful`; the failed notification rule; voiding the completing deployment keeps Completed and `get_release_history` reports `completingVoided` (AC-1, AC-2 server side, AC-3)
  Files: modules/delivery/db/migrations/0026_release_status_engine.sql, modules/delivery/server/services.ts, modules/delivery/server/release-tracking.ts, modules/delivery/server/queries.ts, modules/delivery/server/overview.ts, modules/delivery/server/portfolio.ts, modules/delivery/server/pin-offers.ts, modules/delivery/contracts.ts, modules/delivery/mcp.ts, modules/delivery/module.ts
  Depends: T1
- [ ] `T3` — The hourly check: `evaluateReleases` (one audited write per tenant, rows locked, Completed untouched, history only on a change, the project zone with UTC fallback) as workflow `delivery.release-status` with its hourly schedule in the manifest (AC-4, AC-5, AC-6)
  Files: modules/delivery/server/release-check.ts, modules/delivery/module.ts
  Depends: T2
- [ ] `T4` — Tests and docs: the brief's full list (planned, in progress, off track, on time, late, matching and other environments, failed, testing, rollback, void, repeated run, finality, a completion during the check), 123's void test amended, README, lint, typecheck (AC-8)
  Files: modules/delivery/tests/release-engine-126.test.ts, modules/delivery/tests/release-tracking-123-writes.test.ts, modules/delivery/README.md
  Depends: T3

## Verify

<!-- Filled by verify. -->
