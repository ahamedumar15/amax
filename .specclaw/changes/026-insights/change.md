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

Approved by the product owner in Discord, 2026-10-18 ("start with 38, then wave 4"); 026 is in wave 4.

Insights reads other modules only through their contracts, as the viewer (AC-2). What they publish today is computed live:
- headcount, joiners and leavers (attrition) from hr `listPeople`
- certifications and those expiring from learning
- bench by month from allocations `personMonthTotals` less FTE
- leave on the people allocated to a project from leave `approvedLeave`
- pipeline, and win rate from won and lost stages, from presales
- utilisation from reports

Contracts don't yet publish delivery velocity, due dates or margin, a skills matrix, promotions, RFP debriefs or client conversations. Insights built on those are stored as insight records: an agent job's output, or `record_insight`. Each record must carry at least one source with an evidence link, a confidence level and a date. A record without a source is refused by the tool and by a DB check, and is never shown (AC-1). The fixtures seed the mock's briefing, risks, opportunities, market and trends with fictional sources. BACKLOG gets one follow-up per missing contract.

The mock's "Recurring agent work" lists 029 schedules (`listSchedules`, `agentJobs`) with their last result, and switches each through chat (`set_schedule_enabled`, as Settings > Workflows does). It includes 025's "Teams and email scan" (AC-3).

The "Next 90 days" and "Next 12 months" tabs are read-only horizons. "Board pack" exports the screen's insights as CSV.

- [x] `T1` — Insights screen, as in the mock:
  - the lede and horizon tabs
  - "This week's briefing", each point with its source, confidence and date, "Show evidence" and "Discuss with amax"
  - Projects at risk (Delivery, Commercial and People tabs)
  - Opportunities from your skills
  - Talent growth (headcount and AI-skills chart with a screen-reader table, attrition, promoted, certifications)
  - Market position with the peer bars
  - World trends to act on (Take on, Watch, Skip)
  - Recurring agent work, with on/off through Ask amax and "New job" opening chat
  - Every card, row, stat and trend is pinned; no forms (AC-1, AC-3)
  Files: modules/insights/ui/*.tsx, modules/insights/ui/insights.css, modules/insights/server/views.ts, modules/insights/module.ts, modules/insights/tests/e2e/*
- [x] `T2` — Contracts first, then the `insights` schema with RLS:
  - an insight (kind briefing, risk, opportunity, trend or market, with title, body, suggestion, confidence, as_of, horizon and scope), and its sources (label, evidence ref), with a check that every insight has a source
  - settings (the demo's pinned today)
  - live reads through the contracts above, as the viewer, each yielding an insight with its source and evidence
  - read tools and pins
  - audited write tools: `record_insight` (refuses an insight with no source) and `dismiss_insight`
  - fictional fixtures matching the mock's numbers (AC-1, AC-2)
  Files: modules/insights/contracts.ts, modules/insights/db/migrations/0001_insights.sql, modules/insights/server/*.ts, modules/insights/mcp.ts, modules/insights/pins.ts, modules/insights/chat.ts, modules/insights/fixtures/*, modules/insights/tests/db.ts, modules/insights/tests/installed.ts, modules/insights/tests/contracts.test.ts, modules/insights/tests/insights.test.ts
- [x] `T3` — Agents as 029 schedules, each switchable:
  - the weekly strategy briefing, which writes the week's briefing from the current insights in 006's untrusted-input mode and keeps each point's sources
  - the daily project risk scan (allocations, leave and time through contracts)
  - the weekly skills-to-opportunity match (learning, allocations bench, presales pipeline)
  - Each writes through `record_insight` and keeps its sources; an output with no source is dropped. The Recurring agent work list reads every installed module's agent jobs (AC-1, AC-2, AC-3)
  Files: modules/insights/workflows.ts, modules/insights/server/agents.ts, modules/insights/tests/agents.test.ts
  Depends: T2
- [x] `T4` — Module standard: README, package.json, a CODEOWNERS line, retention (insights and sources two years after as_of), switch-off, and degrading without each optional module (allocations, leave, finance, it-access, recruitment, learning, reports). BACKLOG gets the missing-contract follow-ups (delivery velocity, due dates and margin; learning skills matrix; hr promotions; presales debriefs and conversations) (AC-2, AC-4)
  Files: modules/insights/README.md, modules/insights/package.json, modules/insights/tsconfig.json, modules/insights/css.d.ts, .github/CODEOWNERS, modules/insights/tests/standard.test.ts, pnpm-lock.yaml, BACKLOG.md
  Depends: T3

## Verify

Quality: 0 → 0 duplicated lines (npx jscpd modules/insights; specclaw-quality-scan failed with jq "Argument list too long"), so no refactor commit.
