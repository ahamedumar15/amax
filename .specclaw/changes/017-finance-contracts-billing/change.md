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

- [x] `T1` — Financials screen, as in the mock: the lede, the Contract value / Invoiced to date / Overdue tiles, "Invoiced per month" against target with October partial, "Receivables by age", and the Contracts table (kind, value, invoiced meter, next invoice, payments). Open drafts sit in "Next invoice" with Accept or Query through Ask amax. Every tile, card and row is pinned; no forms (AC-1, AC-2, AC-3)
  Files: modules/finance/ui/*.tsx, modules/finance/ui/finance.css, modules/finance/module.ts, modules/finance/pins.ts, modules/finance/tests/e2e/finance.spec.ts
- [x] `T2` — Contracts first, then the `finance` schema (contract: fixed, T&M with cap, retainer; milestone; invoice and lines; payment; credit note; stored fx rates; settings). Money carries currency; each invoice stores its base-currency amount at the stored rate; totals by entity convert to base currency. Reads and audited write tools (create contract, add milestone, invoice retainer, record payment, issue credit note). Fixtures match fixtures.md (AC-1, AC-3)
  Files: modules/finance/contracts.ts, modules/finance/db/migrations/0001_finance.sql, modules/finance/server/*.ts, modules/finance/mcp.ts, modules/finance/fixtures/, modules/finance/tests/db.ts, modules/finance/tests/installed.ts, modules/finance/tests/contracts.test.ts, modules/finance/tests/billing.test.ts
- [x] `T3` — Tax per entity (AU GST 10%; SL SSCL 2.5% and VAT 18% on the SSCL-inclusive value; zero-rated exports) on every invoice, and credit notes that reduce invoiced and open amounts (AC-3)
  Files: modules/finance/server/tax.ts, modules/finance/tests/tax.test.ts
  Depends: T2
- [x] `T4` — The billing agent: approved time on a T&M contract's project becomes an invoice draft (hours × rate, within the cap); `delivery.release.deployed` to Prod turns a release's milestone into an invoice draft. Each draft is a 006 suggestion Finance accepts, which issues the invoice (AC-2)
  Files: modules/finance/suggestions.ts, modules/finance/server/drafts.ts, modules/finance/tests/drafts.test.ts
  Depends: T2, T3
- [x] `T5` — Module standard: README, manifest, CODEOWNERS line, retention, can be switched off, and degrades without time and without delivery events (AC-4)
  Files: modules/finance/README.md, modules/finance/package.json, .github/CODEOWNERS, modules/finance/tests/standard.test.ts
  Depends: T4

## Verify

Quality: 10 → 10 duplicated lines (jscpd over modules/finance, tests included; 0 outside tests. The two clones are the DB tests' shared describe/beforeAll/afterAll setup, left as is. specclaw-quality-scan failed with jq "Argument list too long", so jscpd was run directly.)

Outside `modules/finance`: one CODEOWNERS line and `pnpm-lock.yaml` (the new workspace package). No other module's standard test needed relaxing: time's switch-off test already allows `@amax/time/contracts`, and delivery has none. Delivery's project Contract tab still shows "Arrives with finance, 017"; wiring it to finance is a delivery change, left for a follow-up.

Deviations from the mock: "Receivables by age" reads 81% current and 19% 1–30 days (0% 31–60 and over 60), not the mock's 72/18/7/3, because the mock's own Overdue tile ($18,315, only INV-0912) leaves nothing more than 30 days late; the $96,400 open total matches. The Contracts table adds a pin column, Accept draft and Query on Fleet Tracker's open draft, and Invoice on the ready retainer (Ask amax buttons), and the receivables card adds a line with invoiced in each entity's base currency.

