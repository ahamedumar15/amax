# Finance: contracts, billing and receivables

**Change:** 017-finance-contracts-billing · **Created:** 2026-10-17
**Lane:** Finance · **Module:** `modules/finance` · **Depends on:** [007](../007-delivery-projects/change.md), [003](../003-data-core/change.md), [009](../009-time-and-approvals/change.md), [006](../006-agent-governance/change.md)

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

Approved by the product owner in Discord, 2026-10-18 ("start with 38, then wave 4"); 017 is in wave 4.
Fixture contracts are billed by Lumen Labs Lanka to overseas clients, so they are zero-rated exports and
their totals match fixtures.md exactly ($774,000 contract value, $418,200 invoiced, $18,315 overdue);
GST, VAT/SSCL and credit notes are proven on contracts made through the tools.

- [ ] `T1` — Financials screen, as in the mock: the lede, the Contract value / Invoiced to date / Overdue tiles, "Invoiced per month" against target with October partial, "Receivables by age", and the Contracts table (kind, value, invoiced meter, next invoice, payments). Open drafts sit in "Next invoice" with Accept or Query through Ask amax. Every tile, card and row is pinned; no forms (AC-1, AC-2, AC-3)
  Files: modules/finance/ui/*.tsx, modules/finance/ui/finance.css, modules/finance/module.ts, modules/finance/pins.ts, modules/finance/tests/e2e/finance.spec.ts
- [ ] `T2` — Contracts first, then the `finance` schema (contract: fixed, T&M with cap, retainer; milestone; invoice and lines; payment; credit note; stored fx rates; settings). Money carries currency; each invoice stores its base-currency amount at the stored rate; totals by entity convert to base currency. Reads and audited write tools (create contract, add milestone, invoice retainer, record payment, issue credit note). Fixtures match fixtures.md (AC-1, AC-3)
  Files: modules/finance/contracts.ts, modules/finance/db/migrations/0001_finance.sql, modules/finance/server/*.ts, modules/finance/mcp.ts, modules/finance/fixtures/, modules/finance/tests/db.ts, modules/finance/tests/installed.ts, modules/finance/tests/contracts.test.ts, modules/finance/tests/billing.test.ts
- [ ] `T3` — Tax per entity (AU GST 10%; SL SSCL 2.5% and VAT 18% on the SSCL-inclusive value; zero-rated exports) on every invoice, and credit notes that reduce invoiced and open amounts (AC-3)
  Files: modules/finance/server/tax.ts, modules/finance/tests/tax.test.ts
  Depends: T2
- [ ] `T4` — The billing agent: approved time on a T&M contract's project becomes an invoice draft (hours × rate, within the cap); `delivery.release.deployed` to Prod turns a release's milestone into an invoice draft. Each draft is a 006 suggestion Finance accepts, which issues the invoice (AC-2)
  Files: modules/finance/suggestions.ts, modules/finance/server/drafts.ts, modules/finance/tests/drafts.test.ts
  Depends: T2, T3
- [ ] `T5` — Module standard: README, manifest, CODEOWNERS line, retention, can be switched off, and degrades without time and without delivery events (AC-4)
  Files: modules/finance/README.md, modules/finance/package.json, .github/CODEOWNERS, modules/finance/tests/standard.test.ts
  Depends: T4

## Verify
