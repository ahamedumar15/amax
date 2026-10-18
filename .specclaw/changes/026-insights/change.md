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

**Verdict:** PASS

- AC-1: pass.
  - Every insight shown has at least one source linking to its evidence, a confidence and a date.
  - `record_insight` refuses an insight with no source, and so does a deferred DB trigger at commit. One forced in with the trigger off is never shown.
  - The strategy briefing reads insights only as untrusted data, and keeps each point's sources.
  - Tests: `tests/insights.test.ts`, `tests/agents.test.ts`, module e2e.
- AC-2: pass.
  - Live figures come only through other modules' contracts, read as the viewer: hr people, learning certifications, allocations bench, leave, presales pipeline and won/lost, and reports utilisation. A narrower scope sees less: Sarah, limited to AU, sees headcount 13 and no LK risks. A PM sees no utilisation, and an Engineer is refused.
  - With a module missing, the screen leaves its figures out and says so.
  - Tests: `tests/insights.test.ts`, `tests/agents.test.ts`, `tests/standard.test.ts`.
- AC-3: pass.
  - Recurring agent work lists every installed agent job (025's Teams and email scan, 022's triage, allocations' check, and insights' briefing, risk scan and skills match). Each has an on/off switch through Ask amax (`set_schedule_enabled`), and "New job" opens chat.
  - Tests: `tests/agents.test.ts`, module e2e.
- AC-4: pass — contracts and contract tests, README, fixtures, manifest, retention (two years after as_of) and a CODEOWNERS line. The module can be switched off and imports other modules only through contracts. Tests: `tests/contracts.test.ts`, `tests/standard.test.ts`.

Gaps (each in BACKLOG):
- No contract yet publishes delivery velocity, due dates or margin, a skills matrix, promotions, or presales debriefs and close dates. Those insights are source-carrying records seeded by fixtures: the briefing's Fleet Tracker point, risk reasons, people with AI skills, promoted this year, and the 12-month win rate. Each record shows where it came from.
- The live win rate is all-time (11 of 33 closed deals), shown under Market position.
- Attrition is live (8.4%), but the mock's year-on-year change can't be computed from the fixtures. The stat says "14 left in 12 months" instead.
- The mock's Region select and its "Market and trends scan" and "Payroll variance check" jobs aren't built. The list shows only jobs that exist.
- The briefing acts for a named reader (`set_briefing_reader`, Maya in the fixtures), because `think` needs a viewer.

Ripples outside the module:
- `modules/presales/tests/permissions.test.ts`: its switch-off test now allows `@amax/presales/contracts`, which the module standard permits.
- `apps/web/components/marketing/areas.ts`: Insights moves to live, merged with 022's Helpdesk move.
- `BACKLOG.md`: 025's Insights switch item is ticked, and the missing-contract follow-ups are added.

After merging 022, `tests/agents.test.ts` checks that the jobs list contains the named jobs instead of matching it exactly. Helpdesk's `helpdesk.triage` is a new installed job, and so will any later module's be.

Mock: `shots/app.png` (`/insights` as Maya, Admin) matches `shots/mock.png` region by region: the lede with the horizon tabs and Board pack, the briefing, Projects at risk, Opportunities from your skills, Talent growth, Market position with the peer bars, World trends and Recurring agent work. Differences are the gaps above, and the horizon is tabs rather than a select.

Commands (re-run after merging origin/main with 022; Postgres 16 at `DATABASE_MIGRATE_URL`):
- `pnpm turbo run lint --force` → 0 (33/33)
- `pnpm turbo run test --force --continue --concurrency=2` → 32/33. `@amax/insights` failed only the exact job list above. After the fix, `pnpm turbo run test lint --filter=@amax/insights --force` → 0 (9/9).
- `pnpm --filter @amax/web build` → 0
- `playwright test --config playwright.auth.config.ts` (apps/web) → 81/81
- module e2e `pnpm --filter @amax/insights e2e` → 2/2 (axe, nothing unpinned, no forms, switches and New job open chat)
- `specclaw-preset-check .` → 1: the repo-wide comment and line-length convention, the same exception as earlier changes.
- `specclaw-quality-scan . --gate` → not_run (jq "Argument list too long"); jscpd was run directly, see below.

Screenshots: `.specclaw/changes/026-insights/shots/app.png`, `.specclaw/changes/026-insights/shots/mock.png`.
Review: skipped. Per-change review is off (`code_review: false`, product owner 2026-10-17).

Quality: 0 → 0 duplicated lines (npx jscpd modules/insights; specclaw-quality-scan failed with jq "Argument list too long"), so no refactor commit.
