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

Approved by the product owner in Discord, 2026-10-18 ("start with 38, then wave 4"); 018 is in wave 4.
The mock has no Expenses section (Mock Delta: no screen of its own), but the app lists every installed
module's root in the rail (`apps/web/lib/registry.ts`), so the module needs a root screen. It is a
read-only review screen built from the mock's existing patterns (Financials tiles, Payroll's decision
table); every write stays in chat. Demo amounts are fictional; fixtures.md has no expense figures.
Receipt files go through core's S3 storage adapter (`storageFromEnv`). Chat's drawer has no file picker
and `@amax/ai` takes text only, so a receipt photo arrives through the `add_receipt` tool (MCP or API,
base64 with its text layer or OCR text when the client has it); adding a picker to the drawer is a
platform change.

- [x] `T1` — Expenses screen: the lede says what needs the viewer's decision; tiles for Waiting for you, Approved to pay and My open claims; "Needs your decision" (manager step, then finance step) with Approve and Reject as Ask amax buttons; "My claims" with "Claim an expense" through Ask amax; "Categories and limits". Medical claims show their merchant and note only to the claimant and HR (002 health). Every tile, card and row is pinned; no forms (AC-1, AC-2)
  Files: modules/expenses/ui/*.tsx, modules/expenses/ui/expenses.css, modules/expenses/module.ts, modules/expenses/pins.ts, modules/expenses/tests/e2e/*
- [x] `T2` — Contracts first, then the `expenses` schema (category with per-claim limit and receipt threshold per entity, receipt, claim), reads and audited write tools: claim an expense (receipt required over the threshold, over-limit flagged), approve and reject by the claimant's manager then Finance, record a bank payment, set a category's limits. Receipts are stored through the core S3 adapter. Fixtures are fictional (AC-1)
  Files: modules/expenses/contracts.ts, modules/expenses/db/migrations/0001_expenses.sql, modules/expenses/server/*.ts, modules/expenses/mcp.ts, modules/expenses/fixtures/*, modules/expenses/tests/db.ts, modules/expenses/tests/installed.ts, modules/expenses/tests/contracts.test.ts, modules/expenses/tests/claims.test.ts
- [x] `T3` — "Claim expense" chat intent and `add_receipt` (photo or PDF): the receipt agent reads the receipt's text and proposes merchant, day, amount, currency and category as a 006 suggestion the claimant accepts, which files the claim; undo withdraws it while it waits for the manager (AC-2)
  Files: modules/expenses/chat.ts, modules/expenses/suggestions.ts, modules/expenses/server/extract.ts, modules/expenses/tests/receipts.test.ts
  Depends: T2
- [x] `T4` — Payment through payroll: Finance approves a claim to be paid in the next pay run when payroll is installed; `reimbursementsDue` in contracts lists them for payroll; when payroll sends that period's payslips, an agent suggests marking them paid, which Finance accepts (AC-1)
  Files: modules/expenses/server/payroll.ts, modules/expenses/suggestions.ts, modules/expenses/tests/payroll.test.ts
  Depends: T2
- [x] `T5` — Module standard: README, manifest, CODEOWNERS line, retention entries, can be switched off, and works without payroll (bank payment only) (AC-3)
  Files: modules/expenses/README.md, modules/expenses/package.json, .github/CODEOWNERS, modules/expenses/tests/standard.test.ts, pnpm-lock.yaml
  Depends: T4

## Verify
