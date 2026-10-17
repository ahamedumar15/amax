# Presales pipeline

**Change:** 020-presales · **Created:** 2026-10-17
**Lane:** Sales · **Module:** `modules/presales` · **Depends on:** [007](../007-delivery-projects/change.md), [003](../003-data-core/change.md) · **Integrates with (optional):** [017](../017-finance-contracts-billing/change.md)

## Problem

Opportunities from new idea to won or lost, with activities, tasks, risks and promotion to a delivery project.

## Mock Delta

What changes on screen, and where to see it: [`001-amax-foundation-presales`](../../mock/index.html#001-amax-foundation-presales)

Presales board with Move, the opportunity page (stage history, win chance, activities, tasks, risks), Mark as lost, Promote to delivery.

## Acceptance Criteria

1. **AC-1** `presales` schema: client, opportunity (stage, win chance, value with currency, health computed from risks), activity, task, risk and stage history (every change logged with who and when).
2. **AC-2** Moving stage is explicit and audited. Lost needs a reason. Promote to delivery creates a project through the delivery contract.
3. **AC-3** Chat intent "new opportunity". The pipeline converts to USD with the original currency kept, and matches fixtures.md ($596,000 open).
4. **AC-4** The module meets `docs/module-standard.md`: it changes nothing outside `modules/<name>/` (apart from its CODEOWNERS line); its `contracts.ts` is published first and has contract tests; it has a README, fixtures and a manifest; it can be switched off; and every optional integration degrades gracefully when the other module isn't installed.

## Tasks

- [x] `T1` — Contract first: `contracts.ts` (opportunity refs, stages, events and payloads, pipeline read) with contract tests; manifest (Business group, grants, routes, retention); README; package; CODEOWNERS line (AC-4)
  Files: modules/presales/{module.ts,contracts.ts,package.json,tsconfig.json,css.d.ts,README.md}, modules/presales/tests/contracts.test.ts, .github/CODEOWNERS, pnpm-lock.yaml
- [x] `T2` — Screens matching the mock: Presales board (tickets, found-by-agents strip, six stage lanes with Move and Remove, pipeline chart, recent stage changes) and the opportunity page (stage steps, details with computed health, stage history, activities, tasks, risks, win-chance chart, Mark as lost dialog, Promote to delivery) (AC-1, AC-2)
  Files: modules/presales/ui/*, modules/presales/actions.ts
  Depends: T1
- [x] `T3` — `presales` schema and fixtures: client, opportunity (stage, win chance, value + currency + USD, health from risks), activity, task, risk, stage history, suggestion, fx rate, pipeline snapshot; RLS on tenant_id; fixtures.md pipeline ($596,000 open, $280,800 weighted, Northwind history) (AC-1, AC-3)
  Files: modules/presales/db/migrations/0001_presales.sql, modules/presales/fixtures/index.ts
  Depends: T1
- [x] `T4` — Services and queries: explicit audited stage moves logging who and when, Lost needs a reason, remove, activities/tasks/risks, accept/dismiss suggestions, USD conversion keeping the original currency, Promote to delivery through the delivery contract (degrades when delivery doesn't publish project creation) (AC-1, AC-2, AC-3)
  Files: modules/presales/server/*
  Depends: T3
- [x] `T5` — MCP tools and the "new opportunity" chat intent; search contribution; monthly pipeline snapshot job (AC-3)
  Files: modules/presales/{mcp.ts,chat.ts,jobs.ts}
  Depends: T4
- [x] `T6` — Tests: service and audit, permissions, RLS leak, switch-off and without-finance, chat intent, and the module e2e (board and opportunity against the mock, axe) (AC-1–AC-4)
  Files: modules/presales/tests/*
  Depends: T5

## Verify

Quality: 71 → 71 duplicated lines (repo-wide; presales accounts for 23: its `ctxFor` and MCP `tool()` helper mirror delivery's, which only a platform change could share, and two 6-line service headers). No refactor kept.
