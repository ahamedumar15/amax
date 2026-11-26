# A completed release keeps the day it completed on

**Change:** 128-release-completed-day · **Created:** 2026-11-26 · **Review:** change

## Problem

125's final review pass left one major open (125's `## Verify`). The release page works out the completion day at read
time, in the project's legal-entity zone as it is now. `completion` (On time or Late) was judged once, at completion, in
the zone of that moment, and since 126 Completed is final. If the project's legal entity or that entity's zone changes
later, the page can show a day after the target beside "On time", or the reverse.

## Mock Delta

What changes on screen, and where to see it: [`128-release-completed-day`](../../mock/index.html#128-release-completed-day)

- The release page's information card and lede: no new UI. After the project's zone changes, the completed day stays the
  one the release completed on, beside the same On time or Late.

## Acceptance Criteria

Terms. **The completion day**: the day in the project's zone (`releaseDay`, in the entity zone, UTC without one) of the
completing deployment's instant, the day `completion` is judged by.

1. **AC-1 Stored at completion.** Migration 0027 adds `delivery.release.completed_day date`. Completing a release (a
   deployment of its category) stores the completion day with `completed_at` and `completion`, judged from that same
   day, in one write. `release_completed_whole` then also requires `completed_day` on a completed release.
2. **AC-2 Read, never recomputed.** `getRelease` returns the stored day as `completedDay`, and the release page's
   information card and lede show it. Changing the project's legal entity, or the entity's zone, after completion leaves
   the day and On time or Late unchanged.
3. **AC-3 Backfill.** The migration fills `completed_day` for releases completed before it, in their project's zone at
   migration time: the entity's own zone (`workflows.entity_zone`), else UTC. Release tracking (0025) hasn't reached
   `main`, so only dev and test databases hold such rows; a country's default zone isn't consulted there.
4. **AC-4 Scope.** The voided completing deployment's day stays read in the project's current zone (a later event, not
   judged against the target). No other screen or tool changes. `ReleaseTracking` gains `completedDay`, additive.
5. **AC-5 Tests.** A table over at least three zones: complete through `recordDeployment`, then change the project's
   entity or its zone, and the stored day, `completion` and the rendered "Completed on … · On time|Late" still agree;
   the migration's backfill on a release completed before it; the constraint refuses a completed release without a day.

## Tasks

No UI task: the release page already prints `completedDay` (`ui/ReleaseInfo.tsx`, `ui/ReleasePage.tsx`); 128 changes
where that day comes from. `completeBy` is the only writer of a completion.

- [x] `T1` — AC-1 AC-3: migration 0027 adds `completed_day`, backfills completed releases (entity zone, else UTC), and requires it in `release_completed_whole`
  Files: modules/delivery/db/migrations/0027_release_completed_day.sql
- [x] `T2` — AC-1 AC-2 AC-4: `completeBy` stores the day it judged `completion` by; `trackingOf` and `getRelease` return the stored day; the voided day stays in the current zone
  Files: modules/delivery/server/release-tracking.ts, modules/delivery/server/queries.ts, modules/delivery/README.md
  Depends: T1
- [x] `T3` — AC-5: zone-change table through `recordDeployment` and the rendered page; the backfill; the constraint
  Files: modules/delivery/tests/release-completed-day-128.test.ts
  Depends: T2

## Verify

Quality: 860 → 860 duplicated lines (repo-wide; none in 128's files). Build note: no per-task commits from the agent (git is read-only here); the product owner commits.
