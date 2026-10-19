# Build the Overview dashboard to the mock

**Change:** 068-overview-dashboard · **Created:** 2026-10-19

## Problem

The Overview page (`apps/web/app/(app)/page.tsx`) shows only the activity feed. Everything else the
mock puts there is missing: stat tickets, the hours chart, Waiting on you, insights, delivery
performance, where time went, and release readiness. So the first screen people open has nothing
that needs their attention (rule 6). The mock is the 001 section, `#001-amax-foundation`.

## Mock Delta

What changes on screen, and where to see it: [`068-overview-dashboard`](../../mock/index.html#068-overview-dashboard)

The 001 Overview layout stays as is. Two blocks change because the data the 001 mock assumes
doesn't exist; the new section shows only those two:
- **Where time went** is grouped by **project**, not by activity. Time entries have no
  activity-type field, and this change doesn't add one.
- **Release readiness** shows how far each open release has got (environments passed, for example
  3 of 4, as the bar) and its current stage, instead of a made-up percentage.

## Acceptance Criteria

1. **AC-1** Three stat tickets lead the page. **Hours this week** shows the team total and the
   agent share (time `weekTotals`). **Proposals in flight** shows the count, split into building
   and verified (delivery `phaseCounts`). **Ready to invoice** shows the uninvoiced amount and its
   top two lines (finance). Each ticket has a `PinButton` that resolves to that metric.
2. **AC-2** **Hours logged** charts 12 weekly bars, split into agents and people. Read-only
   selects for period and project change the chart through the URL. A new time read returns hours
   per week, agents vs people, with an optional project.
3. **AC-3** **Waiting on you** lists the viewer's open decisions, oldest first: open suggestions
   (including unlinked commit authors), rolled-back releases, proposals awaiting approval, and
   submitted timesheets the viewer may approve. Each row has a `PinButton` and an `IntentButton`
   ("Ask amax" with the record pinned). **Approve selected** opens chat with the selected rows
   pinned. There are no direct writes. An empty queue says so.
4. **AC-4** **Agent insights** shows the top 3 current insights (insights `currentInsights`), each
   pinnable, with a link to Insights.
5. **AC-5** **Delivery performance** shows proposals shipped to Prod this month, the change against
   last month (up or down, as %), and the top contributor by tasks closed this month, the person or
   their agent.
6. **AC-6** **Where time went** is a donut of this week's hours by project, with a legend and the
   share of each project.
7. **AC-7** **Release readiness** shows up to 2 open releases, each with environments passed of
   total as the bar and the current stage, pinnable.
8. **AC-8** Each block reads only through other modules' `contracts.ts` (`check:graph` passes),
   checks `can(viewer, "<module>:read")`, and hides when its module is not installed or not
   readable. A block whose read fails is logged and shows "Couldn't load", never zero.
9. **AC-9** The activity feed stays (008 AC-4). The lede sums up the week from real numbers. The
   page passes axe with no WCAG 2.2 AA violations in light and dark, works from the keyboard, and
   the chart has a text alternative.

## Tasks

<!-- Design: the page never imports a module. Each module adds an `overview` manifest hook (like
     `activity`, 008 AC-4) that returns module-agnostic parts typed in @amax/core: tickets, waiting
     items, and panels (series, share, metric, progress, list). apps/web/lib/overview.ts gathers the
     hooks the viewer may read, with each module's failure isolated. -->

- [x] `T1` — Overview UI: core part types and `overview` hook, the gatherer, and the page with tickets, hours chart, Waiting on you, insights, performance, donut, readiness and activity, plus pins, intents, empty and "Couldn't load" states (AC-1–AC-9 UI, AC-8)
  Files: packages/core/src/module.ts, packages/core/src/index.ts, apps/web/lib/overview.ts, apps/web/app/(app)/page.tsx, apps/web/components/overview/StatTickets.tsx, apps/web/components/overview/SeriesChart.tsx, apps/web/components/overview/WaitingTable.tsx, apps/web/components/overview/ShareDonut.tsx, apps/web/components/overview/Panels.tsx
- [x] `T2` — Time: a `weeklyHours` contract read (12 weeks, agents vs people, optional project); overview hook giving the Hours ticket, the series panel, the by-project share panel and submitted weeks the viewer may approve (AC-1, AC-2, AC-3, AC-6)
  Files: modules/time/contracts.ts, modules/time/server/overview.ts, modules/time/module.ts, modules/time/tests/overview.test.ts
  Depends: T1
- [x] `T3` — Delivery: reads for month-over-month shipped, top contributor and release progress; overview hook giving the Proposals ticket, the performance metric, readiness progress and waiting items (rolled-back releases, proposals awaiting approval) (AC-1, AC-3, AC-5, AC-7)
  Files: modules/delivery/server/queries.ts, modules/delivery/server/overview.ts, modules/delivery/module.ts, modules/delivery/tests/overview.test.ts
  Depends: T1
- [ ] `T4` — Finance: a `readyToInvoice` read (open drafts, total + top lines per currency) and the Ready to invoice ticket (AC-1)
  Files: modules/finance/contracts.ts, modules/finance/server/overview.ts, modules/finance/module.ts, modules/finance/tests/overview.test.ts
  Depends: T1
- [ ] `T5` — Insights: overview hook giving the top 3 current insights as a list panel (AC-4)
  Files: modules/insights/server/overview.ts, modules/insights/module.ts
  Depends: T1
- [ ] `T6` — Integration: open suggestions in Waiting on you, the lede from real numbers, e2e coverage for every block with axe in light and dark, and count ripples (AC-3, AC-8, AC-9)
  Files: apps/web/lib/overview.ts, apps/web/app/(app)/page.tsx, apps/web/tests/e2e/overview.spec.ts
  Depends: T2, T3, T4, T5

## Verify
