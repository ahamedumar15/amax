# Reports: utilisation and availability

**Change:** 027-reports · **Created:** 2026-10-17
**Lane:** Delivery · **Module:** `modules/reports` · **Depends on:** [009](../009-time-and-approvals/change.md), [010](../010-allocations-forecast/change.md), [012](../012-leave/change.md)

## Problem

Utilisation (billable ÷ available), availability, and estimate vs actual.

## Mock Delta

What changes on screen, and where to see it: [`001-amax-foundation-reports`](../../mock/index.html#001-amax-foundation-reports)

Reports: utilisation trend and table.

## Acceptance Criteria

1. **AC-1** Utilisation is billable hours ÷ available hours. Available hours account for leave and holidays. Fixtures give the team 84% for October to date.
2. **AC-2** Export to CSV. Values available to screen readers.
3. **AC-3** The module meets `docs/module-standard.md`: it changes nothing outside `modules/<name>/` (apart from its CODEOWNERS line); its `contracts.ts` is published first and has contract tests; it has a README, fixtures and a manifest; it can be switched off; and every optional integration degrades gracefully when the other module isn't installed.

## Tasks

Approved by the product owner in Discord, 2026-10-18 ("start with 38, then wave 4"); 027 is in wave 4.
The module may change nothing outside `modules/reports/` (AC-3), and today's contracts don't give a
person's hours over a date range (time's `weekTotals` is per ISO week; `projectHours` has no
per-person rows) or the holiday calendar (leave keeps it internal). So reports keeps its own read
model of logged hours, fed by time's `time.entry.logged` event (insert-only), and its own holiday
calendar per legal entity (seeded with the leave packs' dates, kept by a write tool). Leave comes live
from `approvedLeave`, people and FTE from hr, allocations from `personMonthTotals`, all read as the
signed-in viewer. A person's row shows only when the viewer reaches them in hr and could see their
whole timesheet in time (self, time:team, time:approve, or their manager); their leave counts only
when leave's own rule lets the viewer see it, otherwise the row says so and stays out of the team
figure. The mock's third tab, Estimate vs actual, is left out: no contract publishes estimates.
Fixture hours are fictional and give fixtures.md's October table (222 ÷ 264 = 84%) and 12-month trend.

- [x] `T1` — Reports screen, as in the mock: the lede states the team's utilisation for the month to date against the target; "Utilisation, last 12 months" trend with the target line and a screen-reader table; the Utilisation table (available after leave and holidays, logged, billable, meter and %) with a Team row; an Availability tab (rest of the month after holidays and approved leave, allocated %, free hours) as read-only links; Export downloads the tab as CSV with formula cells neutralised; target and holidays change through Ask amax. Every card and row is pinned; no forms (AC-1, AC-2)
  Files: modules/reports/ui/*.tsx, modules/reports/ui/reports.css, modules/reports/module.ts, modules/reports/pins.ts, modules/reports/tests/e2e/*
- [x] `T2` — Contracts first, then the `reports` schema (logged-hours read model, holiday calendar, settings with the target and the demo's today), the `time.entry.logged` handler, utilisation and availability computed through hr, leave and allocations contracts as the viewer, read tools (`get_utilisation` with a CSV format, `get_person_utilisation`) and audited write tools (`set_utilisation_target`, `set_holiday`). Fictional fixtures give October's 84% and the trend (AC-1, AC-2)
  Files: modules/reports/contracts.ts, modules/reports/db/migrations/0001_reports.sql, modules/reports/server/*.ts, modules/reports/mcp.ts, modules/reports/fixtures/*, modules/reports/tests/db.ts, modules/reports/tests/installed.ts, modules/reports/tests/contracts.test.ts, modules/reports/tests/utilisation.test.ts
- [x] `T3` — Module standard: README, manifest, CODEOWNERS line, retention entry for the hours read model, can be switched off, and works without leave, allocations and time installed (AC-3)
  Files: modules/reports/README.md, modules/reports/package.json, modules/reports/tsconfig.json, modules/reports/css.d.ts, .github/CODEOWNERS, modules/reports/tests/standard.test.ts, pnpm-lock.yaml
  Depends: T2

## Verify
