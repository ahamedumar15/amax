# Payroll engine

**Change:** 014-payroll-engine · **Created:** 2026-10-17
**Lane:** Payroll · **Module:** `modules/payroll` · **Depends on:** [011](../011-hr-core/change.md), [012](../012-leave/change.md), [006](../006-agent-governance/change.md) · **Integrates with (optional):** [009](../009-time-and-approvals/change.md)

## Problem

Pay runs with steps, variance explanations by the payroll agent, payslips and bank files, country-agnostic. Country rules plug in from 015/016.

## Mock Delta

What changes on screen, and where to see it: [`001-amax-foundation-payroll`](../../mock/index.html#001-amax-foundation-payroll)

Payroll: steps, totals, where the money goes, cost line, changes with Accept/Query, payslips and the payslip drawer.

## Acceptance Criteria

1. **AC-1** `payroll` schema: pay component, pay group, run, payslip line. Runs move Draft → Agent check → HR approval → Finance approval → Bank file → Payslips sent, and each step is audited.
2. **AC-2** The payroll agent explains every change from last period as a suggestion. "Approve run" stays disabled until every queried line is resolved.
3. **AC-3** Pay values are visible only to Payroll and Admin (002), and to employees for their own payslip.
4. **AC-4** A country-pack interface (`calculate`, `statutory`, `filings`) lets 015 and 016 plug in without changing the engine.
5. **AC-5** The module meets `docs/module-standard.md`: it changes nothing outside `modules/<name>/` (apart from its CODEOWNERS line); its `contracts.ts` is published first and has contract tests; it has a README, fixtures and a manifest; it can be switched off; and every optional integration degrades gracefully when the other module isn't installed.

## Tasks

## Verify
