# Finance: contracts, billing and receivables

**Change:** 017-finance-contracts-billing · **Created:** 2026-10-17
**Lane:** Finance · **Module:** `modules/finance` · **Depends on:** [007](../007-delivery-projects/change.md), [003](../003-data-core/change.md), [009](../009-time-and-approvals/change.md)

## Problem

Contracts per project, invoicing (time-and-materials from approved time, milestones on release to Prod), receivables and overdue tracking.

## Mock Delta

What changes on screen, and where to see it: [`001-amax-foundation-financials`](../../mock/index.html#001-amax-foundation-financials)

Financials: totals, invoiced per month (partial October), receivables by age, contracts.

## Acceptance Criteria

1. **AC-1** `finance` schema: contract (fixed, T&M with cap, retainer), invoice, payment. Money carries currency, and totals convert to the entity's base currency with stored rates.
2. **AC-2** T&M invoice drafts come from approved time (time contract); milestone invoices come from `delivery.release.deployed` to Prod. Both are suggestions finance accepts.
3. **AC-3** Tax per entity (AU GST, SL VAT/SSCL) and credit notes. Numbers match fixtures.md ($774,000 contract value, $418,200 invoiced).
4. **AC-4** The module meets `docs/module-standard.md`: it changes nothing outside `modules/<name>/` (apart from its CODEOWNERS line); its `contracts.ts` is published first and has contract tests; it has a README, fixtures and a manifest; it can be switched off; and every optional integration degrades gracefully when the other module isn't installed.

## Tasks

## Verify
