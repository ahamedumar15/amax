# Insights: briefing, risk, opportunities, market

**Change:** 026-insights · **Created:** 2026-10-17
**Lane:** Intelligence · **Module:** `modules/insights` · **Depends on:** [006](../006-agent-governance/change.md), [007](../007-delivery-projects/change.md), [009](../009-time-and-approvals/change.md), [011](../011-hr-core/change.md), [020](../020-presales/change.md), [029](../029-workflows-scheduler/change.md) · **Integrates with (optional):** [010](../010-allocations-forecast/change.md), [012](../012-leave/change.md), [017](../017-finance-contracts-billing/change.md), [021](../021-it-access-licences/change.md), [023](../023-recruitment/change.md), [024](../024-learning/change.md)

## Problem

Weekly agent briefing, projects at risk, opportunities matched to skills, talent growth, market position and trends to act on.

## Mock Delta

What changes on screen, and where to see it: [`001-amax-foundation-insights`](../../mock/index.html#001-amax-foundation-insights)

Insights: briefing, projects at risk, opportunities from skills, talent growth, market position, trends, recurring agent jobs.

## Acceptance Criteria

1. **AC-1** Every insight carries a source, a confidence level and a date, and links to its evidence. Insights without a source are not shown.
2. **AC-2** Reads other modules only through their contracts, within the viewer's scope.
3. **AC-3** Recurring agent jobs listed with on/off switches (006).
4. **AC-4** The module meets `docs/module-standard.md`: it changes nothing outside `modules/<name>/` (apart from its CODEOWNERS line); its `contracts.ts` is published first and has contract tests; it has a README, fixtures and a manifest; it can be switched off; and every optional integration degrades gracefully when the other module isn't installed.

## Tasks

## Verify
