# Allocations and capacity forecast

**Change:** 010-allocations-forecast · **Created:** 2026-10-17
**Lane:** Delivery · **Module:** `modules/allocations` · **Depends on:** [007](../007-delivery-projects/change.md), [011](../011-hr-core/change.md) · **Integrates with (optional):** [012](../012-leave/change.md)

## Problem

Plan people across projects by month, see over-allocation and the bench ahead.

## Mock Delta

What changes on screen, and where to see it: [`001-amax-foundation-allocations`](../../mock/index.html#001-amax-foundation-allocations)

Allocations: capacity vs demand, January bench, per-person monthly grid with totals.

## Acceptance Criteria

1. **AC-1** `allocations` schema: allocation (person, project, month, percent) and forecast. Per-person totals show, and over 100% is flagged.
2. **AC-2** Capacity vs demand and bench come from allocations plus HR contracts (through the `hr` contract) and match fixtures.md (January bench 6).
3. **AC-3** Copy to next month, an audited bulk action. Chat intent "allocate".
4. **AC-4** The module meets `docs/module-standard.md`: it changes nothing outside `modules/<name>/` (apart from its CODEOWNERS line); its `contracts.ts` is published first and has contract tests; it has a README, fixtures and a manifest; it can be switched off; and every optional integration degrades gracefully when the other module isn't installed.

## Tasks

- [x] `T1` — Publish `contracts.ts` (allocation types, `listAllocations`, `personMonthTotals`, event names and payloads) with contract tests (AC-4)
  Files: modules/allocations/contracts.ts, modules/allocations/package.json, modules/allocations/tsconfig.json, modules/allocations/tests/contracts.test.ts
- [x] `T2` — Allocations screen: capacity vs demand chart, January bench by skill donut, per-person monthly grid with totals and over-100% flagged, Copy to next month (AC-1, AC-2, AC-3)
  Files: modules/allocations/ui/AllocationsPage.tsx, modules/allocations/ui/Grid.tsx, modules/allocations/ui/charts.tsx, modules/allocations/ui/CopyMonth.tsx, modules/allocations/ui/parts.tsx, modules/allocations/ui/allocations.css, modules/allocations/css.d.ts
  Depends: T1
- [x] `T3` — `allocations` schema (member with team and skill, allocation per person/project/month/percent, forecast demand) with RLS; forecast queries that read people and FTE through the `hr` contract and projects through the `delivery` contract (AC-1, AC-2)
  Files: modules/allocations/db/migrations/0001_allocations.sql, modules/allocations/server/forecast.ts, modules/allocations/server/grid.ts, modules/allocations/server/read.ts, modules/allocations/server/context.ts
  Depends: T1
- [x] `T4` — Services: set allocation and the audited Copy to next month bulk action; MCP tools and the "allocate" chat intent (AC-3)
  Files: modules/allocations/server/services.ts, modules/allocations/actions.ts, modules/allocations/mcp.ts, modules/allocations/chat.ts
  Depends: T3
- [x] `T5` — Manifest (group Work, order 30, depends on delivery and hr, integrates with leave), fixtures that reproduce fixtures.md (capacity 140..144, demand 138..141, January bench 6, Nimal/Kasun/Ayesha), README, CODEOWNERS line (AC-2, AC-4)
  Files: modules/allocations/module.ts, modules/allocations/fixtures/index.ts, modules/allocations/fixtures/plan.ts, modules/allocations/README.md, .github/CODEOWNERS
  Depends: T4
- [x] `T6` — Tests: forecast matches fixtures.md, over-100% flag, copy-month audit and event, permissions, RLS, runs without the optional leave module (AC-1..AC-4)
  Files: modules/allocations/tests/allocations.test.ts, modules/allocations/tests/setup.ts
  Depends: T5

## Verify

**Verdict:** PASS

- AC-1: pass — `allocations` schema (member with team and skill, allocation per person/project-or-other-work/month/percent, unstaffed forecast demand), RLS-forced; the grid shows per-person totals and flags totals above the person's FTE (Ayesha 120% in December, red) (allocations.test.ts AC-1; contracts.test.ts).
- AC-2: pass — capacity comes from hr employment periods through the hr contract, demand from allocations plus forecast rows, and both match fixtures.md exactly: capacity 140, 141, 142, 142, 143, 144; demand 138, 140, 141, 136, 138, 141; January bench 6 (.NET 3, React 1, QA 1, Data 1). Screenshot-compared with the mock; axe clean on /allocations and /allocations/everyone.
- AC-3: pass — Copy to next month is an audited bulk action (`allocations.month.copy` audit row, `allocations.month.copied` event) that never overwrites planned slots and copies only rows the viewer may allocate (a PM: their projects). The "allocate" chat intent fills the `allocate` tool, which is scoped `@managed` for PMs.
- AC-4: pass — `contracts.ts` published first (commit 20046bb) with contract tests; README, fixtures, manifest; only `modules/allocations/**` and one CODEOWNERS line (plus the lockfile entry for the new workspace package) changed; `AMAX_MODULES_DISABLED=allocations` builds; optional `leave` isn't installed, the tests run without it, and the screen says booked leave isn't subtracted yet.

Commands (DB tests with `DATABASE_MIGRATE_URL` on the local test Postgres):
- `pnpm --filter @amax/allocations test` → 0 (5); hr 0 (6), delivery 0 (115), testing 0 (14), auth 0 (47), core 0 (48), mcp 0, db 0, web 0 (26)
- `pnpm --filter @amax/allocations lint` → 0; `pnpm --filter @amax/web lint` → 0 (with the module on and off); `node scripts/check-graph.mjs` → 0
- `specclaw-preset-check modules/allocations` → 1: 38 `comment` findings only, kept to match the repo's module standard and the delivery reference (which document the why in comments).
- `specclaw-quality-scan modules/allocations --gate` → 2 (jscpd parse_error, gate not_run); lizard: 0 high-complexity functions.

Quality: 0 → 0 duplicated lines

Screenshots: `.specclaw/changes/010-allocations-forecast/shots/app-allocations.png`, `mock-allocations.png`. Deliberate differences: Nimal is planned through February (the mock shows "–"), so the lede names only Kasun as he does in the mock; the team control is a label while there's one team; future-month cells use an outline instead of 65% opacity, which failed colour contrast.
