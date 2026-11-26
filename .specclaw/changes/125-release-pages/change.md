# Release tracking, phase 3: the release pages show name, category, status and dates

**Change:** 125-release-pages · **Created:** 2026-11-26 · **Review:** change

Size waiver: 554 production lines against the 400 cap (product owner, 2026-11-26). One screen set whose parts only work
together: the list's columns and filters share one rule with `list_releases`, and the release page's cards share it with
the edit card. Most lines are new UI components under 80 lines each, plus their styles.

## Problem

Since 123 and 124 a release has a name, a category, dates and a status, but the pages still show only a version and
one column per environment, with no way to filter or sort, and the detail page lists deployments in one flat table
with no status history. The product owner's phase 3 brief (2026-11-26) asks for the list and detail pages to show
the release tracking data, filter and sort, group deployments by environment, show the status history, and let the
people who may edit a release that isn't completed. Phase 4 is out of scope.

Decisions (product owner, 2026-11-26): the brief's **Off-Track** is the stored `overdue`, labelled **"Off track"**
everywhere (pages, chips, chat refusals); **Edit** follows rule 1: "Edit release" asks amax, and `update_release`
gets a form card like 124's New release card. No edit form in the page.

## Mock Delta

What changes on screen, and where to see it: [`125-release-pages`](../../mock/index.html#125-release-pages)

- Releases (all projects and a project's tab): Status, Category and Sort filters above the table; each row shows name
  and version, category, a status chip, start, target, proposals and a deployment progress track.
- Release page: an information card, proposals with phase and link, deployments grouped by environment, and the
  status history. "Edit release" opens chat's edit card; a completed release says it can't change and offers no edit.

## Acceptance Criteria

Terms. **Tracked** and **untracked** as in 123. Status labels: Planned, In progress, **Off track** (stored
`overdue`), Completed; an untracked release reads "Untracked". **May edit**: `delivery:release:create` on the project
(an Admin or its PM). Both lists are the shared `ReleasesCards` (the all-projects page and a project's Releases tab).

1. **AC-1 List columns.** The All releases table shows: Release (name, with the version under it, linking to the
   page), Project (all-projects page only), Category, Status (a chip; Off track uses the bad tone, Completed good,
   with "late" beside a late completion), Start, Target (dates as "12 Dec 2026"), Proposals (withdrawn left out, 123),
   Progress (the release's environments in order, each reached, testing, rolled back or not yet, with the furthest
   one named), and the existing Action and pin. An untracked release shows its version as its name, "—" for
   category and dates and an "Untracked" chip. Every row keeps its pin.
2. **AC-2 Filters and sort.** Above the table, three link groups (read-only controls, like the map's Active/All) set
   `?status=` (All, Planned, In progress, Off track, Completed, Untracked), `?category=` (All, Dev, UAT, Prod) and
   `?sort=` (Newest, the default; Start date; Target date, each earliest first, untracked last). They combine, keep
   the map's `?map=`, mark the current one with `aria-current`, and work on both lists. `list_releases` takes the same
   `status`, `category` and `sort` inputs, so chat and the pin read the same list.
3. **AC-3 Empty and filtered states.** No releases: the existing "No releases yet" empty state. Releases, but none
   match: "No releases match these filters" with a "Clear filters" link to the unfiltered list.
4. **AC-4 Loading and error states.** While the list loads, the table area shows a skeleton (a Suspense fallback with
   `aria-busy`); if the read fails, the card says "Couldn't load releases" with "Try again" (a link to the same URL)
   instead of the app's error page. The release page does the same for its cards.
5. **AC-5 Release information.** The release page opens with an information card: name, version, project, category,
   status chip, start, target and, once completed, the completion date and On time or Late. Untracked: the card says
   so and, for someone who may edit, offers "Ask amax to track it".
6. **AC-6 Proposals.** The proposals card lists each proposal in the release: key and title linking to its page, its
   phase chip, and its pin (as today).
7. **AC-7 Deployments by environment.** Deployment history is grouped under the project's environments in order
   (Dev, QA, UAT, Prod or the project's own names), each group headed by the environment and "Prod" where it is; rows
   show status (deployed, testing, rolled back, or voided with its reason), date and time in the viewer's zone, who
   recorded it, the pipeline run as its reference, and the note. An environment without deployments says "Not
   deployed yet". Void and the row pins stay. The deployment that completed the release is marked "Completed the
   release".
8. **AC-8 Status history.** A status history card lists each change oldest first: from, to (chips), when, why
   ("Created", "Edited", "Deployed to UAT", "Deployment voided"), and who. An untracked release says it has no status
   history yet.
9. **AC-9 Edit.** For someone who may edit, an open release shows "Edit release" (an AskButton) that opens chat with
   the release pinned and "Edit <name> (<version>)", and `update_release` answers with a form card: Name, Category
   chips, Start, Target, filled from the release, each checked as you edit with the service's schemas, "Save", and a
   receipt "Updated <name> (<version>)". Someone who may not sees no Edit and the line "Only the project's PM or an
   Admin can change a release".
10. **AC-10 Completed is read-only.** A completed release shows "Completed on <date> · On time|Late. A completed
    release can't change." and no Edit, re-tag or change-proposals buttons; `update_release`, `tag_release` and
    `set_release_proposals` already refuse it (123).
11. **AC-11 Refresh.** After a release is created or edited in chat, the page the person is on shows it without a
    reload (the existing revalidation after confirm), including its new status and history.
12. **AC-12 Tests.** List rows, filters and sort (unit, on `ReleasesCards` and `list_releases`); the detail cards
    (information, proposals, grouped deployments, status history); edit permission and the completed read-only state;
    the edit card's fields, checks and receipt (chat flow); e2e: create a release in chat on a Releases page and see
    the row appear, then edit it and see the change; light and dark, keyboard, axe clean.

## Tasks

- [x] `T1` — The list: name and version, category, status chip ("Off track", "late"), start, target, proposals, progress track; Status, Category and Sort link groups on both lists; filtered-empty with Clear filters; a skeleton while loading and "Couldn't load releases" with Try again (AC-1 to AC-4)
  Files: modules/delivery/ui/ReleasesPage.tsx, modules/delivery/ui/ProjectLists.tsx, modules/delivery/ui/release-list.ts, modules/delivery/ui/ReleaseFilters.tsx, modules/delivery/ui/LoadSafe.tsx, modules/delivery/ui/delivery.css, modules/delivery/server/release-status.ts
- [x] `T2` — The release page: information card (completion, On time or Late, untracked offer), proposals, deployments grouped by environment with the completing one marked, status history, Edit release for those who may, the read-only line, the completed release's read-only state, the same loading and error states (AC-5 to AC-8, AC-9 page side, AC-10)
  Files: modules/delivery/ui/ReleasePage.tsx, modules/delivery/ui/ReleaseInfo.tsx, modules/delivery/ui/ReleaseDeployments.tsx, modules/delivery/ui/ReleaseHistory.tsx, modules/delivery/ui/delivery.css
  Depends: T1
- [x] `T3` — Reads and the edit card: `list_releases` takes `status`, `category` and `sort` (one rule with the page, `release-list.ts`); `get_release_history` marks the completing deployment; `update_release` gets a draft, a `propose` check with the service's schemas, a form card filled from the release, and the receipt; the scripted parser opens it (AC-2 tool side, AC-7, AC-9)
  Files: modules/delivery/server/queries.ts, modules/delivery/server/release-edit-card.ts, modules/delivery/server/write-cards.ts, modules/delivery/mcp.ts, packages/ai/src/scripted-writes.ts
  Depends: T1
- [x] `T4` — Tests and wiring: list rows, filters and sort; detail cards; edit permission and completed read-only; the edit card's fields, checks and receipt (chat flow); refresh after create and edit (e2e); axe in both themes; README; lint, typecheck (AC-11, AC-12)
  Files: modules/delivery/tests/release-pages-125.test.ts, modules/delivery/tests/release-edit-125.test.ts, packages/ai/tests/scripted-writes.test.ts, apps/web/tests/e2e/release-pages.spec.ts, modules/delivery/README.md
  Depends: T2, T3

## Verify

Build notes (2026-11-26): the filter and sort rule lives in `server/release-list.ts` (not `ui/`, as planned) because `list_releases` uses it too. Pages load through `ui/LoadSafe.tsx` (Suspense and a nested async read); `navigation-081`'s render helper now prerenders, which resolves it. The delivery visual test no longer compares the release list's rows with 001's mock rows: 125's own section defines them.

Quality: 860 → 860 duplicated lines (repo-wide; none in this change's files). Complexity: lizard not_run.
