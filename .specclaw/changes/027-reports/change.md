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

## Verify
