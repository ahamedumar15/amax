# Payroll engine

**Change:** 014-payroll-engine · **Created:** 2026-10-17
**Lane:** Payroll · **Module:** `modules/payroll` · **Depends on:** [011](../011-hr-core/change.md), [012](../012-leave/change.md), [006](../006-agent-governance/change.md) · **Integrates with (optional):** [009](../009-time-and-approvals/change.md)

## Problem

Pay runs with steps, variance explanations by the payroll agent, payslips and bank files, country-agnostic. Country rules plug in from 015/016.

## Mock Delta

What changes on screen, and where to see it: [`001-amax-foundation-payroll`](../../mock/index.html#001-amax-foundation-payroll)

Payroll: steps, totals, where the money goes, cost line, changes with Accept/Query, payslips and the payslip drawer.

## Acceptance Criteria

1. **AC-1** `payroll` schema: pay component, pay group, run, payslip line. Runs move Draft → Agent check → HR approval → Finance approval → Bank file → Payslips sent, and each step is audited. Finance approves totals by entity and cost centre, without seeing individual pay. The bank file is an irreversible 006 kind.
2. **AC-2** The payroll agent explains every change from last period as a suggestion. "Approve run" stays disabled until every queried line is resolved.
3. **AC-3** Pay values are visible only to Payroll and Admin (002), and to employees for their own payslip.
4. **AC-4** A country-pack interface (`calculate`, `statutory`, `filings`) lets 015 and 016 plug in without changing the engine.
5. **AC-5** The module meets `docs/module-standard.md`: it changes nothing outside `modules/<name>/` (apart from its CODEOWNERS line); its `contracts.ts` is published first and has contract tests; it has a README, fixtures and a manifest; it can be switched off; and every optional integration degrades gracefully when the other module isn't installed.

## Tasks

Approved by the product owner in Discord, 2026-10-18 ("start with 38, then wave 4"). This is the
country-agnostic engine. The Sri Lanka (EPF/ETF/APIT) and Australia (PAYG/super/STP) figures in the
mock come from 015 and 016. Until they land, a fixture "demo" country pack computes simple, clearly
fictional deductions, so the engine and screen can be shown end to end.

- [x] `T1` — Payroll screen, as in the mock: the run's step bar, the totals tiles, "Where the money goes", the cost line, "Changes since last period" with Accept/Query through Ask amax, and the payslip list and drawer. "Approve run" stays disabled while any change is open. Every row and tile is pinned. Finance sees totals by entity and cost centre only (AC-1, AC-2, AC-3)
  Files: modules/payroll/ui/*.tsx, modules/payroll/ui/payroll.css, modules/payroll/module.ts, modules/payroll/tests/e2e/payroll.spec.ts
- [x] `T2` — Contracts first, then the `payroll` schema (pay component, pay group, run, payslip line). Runs step Draft → Agent check → HR approval → Finance approval → Bank file → Payslips sent, each step an audited service and MCP write tool. Finance approval reads totals by entity and cost centre only (AC-1)
  Files: modules/payroll/contracts.ts, modules/payroll/db/migrations/0001_payroll.sql, modules/payroll/server/*.ts, modules/payroll/mcp.ts, modules/payroll/fixtures/, modules/payroll/tests/runs.test.ts, modules/payroll/tests/contracts.test.ts
- [x] `T3` — The country-pack interface (`calculate`, `statutory`, `filings`). The draft is built from hr pay data, leave and (optionally) time through their contracts. A fixture demo pack covers it until 015 and 016 land (AC-4)
  Files: modules/payroll/packs.ts, modules/payroll/server/draft.ts, modules/payroll/tests/packs.test.ts
  Depends: T2
- [x] `T4` — The payroll agent explains every line that changed since last period as a 006 suggestion (Accept or Query). The run can't be approved while one is open or queried. The bank file is an irreversible 006 kind needing two approvers (AC-1, AC-2)
  Files: modules/payroll/suggestions.ts, modules/payroll/server/variance.ts, modules/payroll/tests/variance.test.ts
  Depends: T3
- [x] `T5` — Pay visibility (002): pay values go only to Payroll and Admin, and to an employee for their own payslip. Finance and everyone else get 404 or totals only, across screens, MCP and chat redaction (`sensitive: pay`) (AC-3)
  Files: modules/payroll/server/read.ts, modules/payroll/tests/visibility.test.ts
  Depends: T2
- [ ] `T6` — Module standard: README, manifest, CODEOWNERS line, retention with statutory periods, can be switched off, and degrades without time (AC-5)
  Files: modules/payroll/README.md, modules/payroll/package.json, .github/CODEOWNERS, modules/payroll/tests/standard.test.ts
  Depends: T4, T5

## Verify
