# Payroll: Sri Lanka country pack

**Change:** 015-payroll-sri-lanka · **Created:** 2026-10-17
**Lane:** Payroll · **Module:** `modules/payroll-lk` · **Depends on:** [014](../014-payroll-engine/change.md)

## Problem

EPF, ETF and APIT for the Sri Lankan entity, with filings.

## Mock Delta

What changes on screen, and where to see it: [`001-amax-foundation-payroll`](../../mock/index.html#001-amax-foundation-payroll)

The Sri Lanka run and Kasun's payslip.

## Acceptance Criteria

1. **AC-1** EPF 8% employee and 12% employer, and ETF 3%, on the configured EPF base. APIT on the current tables. Tests use the worked payslip in fixtures.md (net 279,775).
2. **AC-2** Due dates: APIT by the 15th, EPF and ETF by month end. C-form and returns are exported.
3. **AC-3** Gratuity provision and final settlement.
4. **AC-4** The module meets `docs/module-standard.md`: it changes nothing outside `modules/<name>/` (apart from its CODEOWNERS line); its `contracts.ts` is published first and has contract tests; it has a README, fixtures and a manifest; it can be switched off; and every optional integration degrades gracefully when the other module isn't installed.

## Tasks

## Verify
