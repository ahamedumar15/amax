# Delivery: match the mock, section by section

**Change:** 041-delivery-mock-parity · **Created:** 2026-10-17
**Lane:** Delivery · **Module:** `modules/delivery` · **Depends on:** [007](../007-delivery-projects/change.md)

## Problem

007 shipped the delivery screens from the database, but its visual check covered one board lane. The product owner found the screens drift from the mock: the release map lacks its status pills and styling, three charts are missing, dates are formatted differently, the proposals list doesn't page, and tabs replace the rail entries. The mock is the agreed design, so drift is a defect.

## Mock Delta

No new design. Screens move to match [`001-amax-foundation-projects`](../../mock/index.html#001-amax-foundation-projects), [`-project`](../../mock/index.html#001-amax-foundation-project), [`-proposals`](../../mock/index.html#001-amax-foundation-proposals) and [`-releases`](../../mock/index.html#001-amax-foundation-releases).

## Acceptance Criteria

1. **AC-1** Projects: the head row (lede, client filter, New project), four tickets with their art, "Tasks done per week" (line, planned vs done) and "Revenue by project" (donut), and the portfolio table, as in the mock.
2. **AC-2** Project page: breadcrumb, sprint lede, the mock's tab bar, and cards with the mock's footers. Move stays available but doesn't change the card's resting look (a card menu, not an inline form).
3. **AC-3** Proposals: "Proposals by phase" and "Shipped to Prod per week" side by side, phase segments that filter, and a paged table (Filter, Export) as in the mock.
4. **AC-4** Releases: the map with stations, rolled-back marker and status pills ("Testing since …", "Rolled back …", "Live since …"), and the table with the mock's date and action formats.
5. **AC-5** Projects, Proposals and Releases are rail entries like the mock (one module, several nav entries; needs a manifest `nav[]`).
6. **AC-6** A Playwright visual test compares every section above with the mock at 1440 px and 390 px within 2%, with fixtures pinned to fixtures.md's "today" (Oct 16, 2026) so dates render the same.

## Tasks

- [x] `T1` — Projects screen: head row, four tickets with art, tasks-per-week line and revenue donut, portfolio table (AC-1)
  Files: modules/delivery/ui/ProjectsPage.tsx, modules/delivery/ui/charts.tsx, modules/delivery/ui/art.ts, modules/delivery/ui/ClientFilter.tsx, modules/delivery/ui/delivery.css, modules/delivery/server/queries.ts, modules/delivery/db/migrations/0004_weekly_stats.sql, modules/delivery/fixtures/index.ts
- [x] `T2` — Project page: breadcrumb, sprint lede, the mock's tab bar, card footers, Move behind a card menu (AC-2)
  Files: modules/delivery/ui/ProjectPage.tsx, modules/delivery/ui/delivery.css
- [x] `T3` — Proposals: phase bar and shipped-per-week side by side, phase segments that filter, paged table with Filter and Export (AC-3)
  Files: modules/delivery/ui/ProposalsPage.tsx, modules/delivery/server/queries.ts
- [x] `T4` — Releases: map stations, rolled-back marker and status pills; table date and action formats; New release (AC-4)
  Files: modules/delivery/ui/ReleasesPage.tsx, modules/delivery/ui/parts.tsx
- [x] `T5` — Manifest `nav[]` (optional, backward compatible) rendered as rail entries; Projects, Proposals, Releases in the mock's order; deepest-match active entry; remove the placeholder `modules/hello` (AC-5)
  Files: packages/core/src/module.ts, packages/core/tests/registry.test.ts, apps/web/lib/registry.ts, apps/web/lib/profile.ts, apps/web/components/shell/Shell.tsx, apps/web/app/(app)/[module]/[[...path]]/page.tsx, modules/delivery/module.ts, modules/hello/, apps/web/tests/e2e/shell.spec.ts, apps/web/tests/e2e/chat.spec.ts, pnpm-lock.yaml
- [x] `T6` — Playwright visual test: every section above against the mock at 1440 and 390 px within 2%, AMAX_TODAY pinned to 2026-10-16 (AC-6)
  Files: apps/web/tests/e2e/delivery.spec.ts, apps/web/playwright.auth.config.ts
  Depends: T1, T2, T3, T4, T5

## Verify
