# Accounting journal export

**Change:** 019-accounting-journals · **Created:** 2026-10-17
**Lane:** Finance · **Module:** `modules/accounting` · **Depends on:** [014](../014-payroll-engine/change.md), [017](../017-finance-contracts-billing/change.md)

## Problem

Post payroll and invoices to the general ledger the customer uses.

## Mock Delta

What changes on screen, and where to see it: [`001-amax-foundation-integrations`](../../mock/index.html#001-amax-foundation-integrations)

The Accounting connector card ("Not chosen yet").

## Acceptance Criteria

1. **AC-1** Journal model with an adapter interface. The first adapter is chosen when the customer names their accounting system; CSV export is always available.
2. **AC-2** Postings are idempotent and audited.
3. **AC-3** The module meets `docs/module-standard.md`: it changes nothing outside `modules/<name>/` (apart from its CODEOWNERS line); its `contracts.ts` is published first and has contract tests; it has a README, fixtures and a manifest; it can be switched off; and every optional integration degrades gracefully when the other module isn't installed.

## Tasks

## Verify
