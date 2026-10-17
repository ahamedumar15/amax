# Expenses and reimbursements

**Change:** 018-expenses · **Created:** 2026-10-17
**Lane:** Finance · **Module:** `modules/expenses` · **Depends on:** [011](../011-hr-core/change.md), [003](../003-data-core/change.md), [006](../006-agent-governance/change.md)

## Problem

Replace the email-and-spreadsheet expense process.

## Mock Delta

No screen of its own; this change is infrastructure used by others.

## Acceptance Criteria

1. **AC-1** Claims with receipts (S3 adapter), categories and limits, approval by manager then finance, and payment through payroll or bank.
2. **AC-2** Chat intent "claim expense" with receipt photo upload. Receipt fields are extracted as a suggestion.
3. **AC-3** The module meets `docs/module-standard.md`: it changes nothing outside `modules/<name>/` (apart from its CODEOWNERS line); its `contracts.ts` is published first and has contract tests; it has a README, fixtures and a manifest; it can be switched off; and every optional integration degrades gracefully when the other module isn't installed.

## Tasks

## Verify
