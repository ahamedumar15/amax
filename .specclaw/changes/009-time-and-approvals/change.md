# Time: timesheets and approvals

**Change:** 009-time-and-approvals · **Created:** 2026-10-17
**Lane:** Delivery · **Module:** `modules/time` · **Depends on:** [007](../007-delivery-projects/change.md), [002](../002-identity-and-access/change.md) · **Integrates with (optional):** [011](../011-hr-core/change.md), [012](../012-leave/change.md)

## Problem

Team timesheets with agent-logged hours, submit, approve, reject with comment and period lock.

## Mock Delta

What changes on screen, and where to see it: [`001-amax-foundation-time`](../../mock/index.html#001-amax-foundation-time)

Team time: hours per day, the timesheets table, Approve/Remind, and the My timesheet switch.

## Acceptance Criteria

1. **AC-1** `time` schema: entry (with a `billable` flag), week and approval. Weeks follow ISO weeks; fixtures use week 42 of 2026 (Oct 12–16).
2. **AC-2** Approvals follow the manager or project chain. Reject requires a comment. Approved weeks are locked, and changing a locked week needs Admin and is audited.
3. **AC-3** The Time screen matches the mock within a 2% visual diff. Team total and agent share match fixtures.md (141.5 h, 64%).
4. **AC-4** Chat intent "log time". MCP: `log_time`, `submit_week`, `approve_week`.
5. **AC-5** The module meets `docs/module-standard.md`: it changes nothing outside `modules/<name>/` (apart from its CODEOWNERS line); its `contracts.ts` is published first and has contract tests; it has a README, fixtures and a manifest; it can be switched off; and every optional integration degrades gracefully when the other module isn't installed.

## Tasks

- [x] `T1` — Time screen matching the mock: Team view (hours per day, This week card, timesheets table with Approve/Remind/Export) and the My timesheet switch, with week navigation (AC-3)
  Files: modules/time/ui/TeamPage.tsx, modules/time/ui/MyPage.tsx, modules/time/ui/parts.tsx, modules/time/ui/time.css, modules/time/actions.ts
- [x] `T2` — Publish `contracts.ts` first: ISO week helpers, entry/week types, read functions (week hours, project hours, approved hours) and event names and payloads (AC-1, AC-5)
  Files: modules/time/contracts.ts
- [x] `T3` — `time` schema: entry (billable, source person/agent), week (ISO year/week, status, lock) and approval, all RLS on tenant_id; fixtures for week 42 of 2026 matching fixtures.md (141.5 h, 64% agents, 87.5 h submitted, project split) (AC-1, AC-3)
  Files: modules/time/db/migrations/0001_time.sql, modules/time/fixtures/index.ts
  Depends: T2
- [x] `T4` — Services and queries: log time, submit, approve and reject (comment required) through the manager or project chain, remind, Admin-only audited change and reopen of a locked week (AC-2)
  Files: modules/time/server/services.ts, modules/time/server/queries.ts, modules/time/server/context.ts
  Depends: T3
- [x] `T5` — Manifest, MCP tools (`log_time`, `submit_week`, `approve_week`, plus reject/remind/reopen and reads), chat intent "log time", README, package, CODEOWNERS line (AC-4, AC-5)
  Files: modules/time/module.ts, modules/time/mcp.ts, modules/time/chat.ts, modules/time/README.md, modules/time/package.json, modules/time/tsconfig.json, modules/time/css.d.ts, .github/CODEOWNERS
  Depends: T4
- [x] `T6` — Tests: contract, service, permission and approval-chain tests with and without HR reporting lines, switch-off, fixtures totals; module-local e2e for the screen against the mock (AC-1 to AC-5)
  Files: modules/time/tests/contracts.test.ts, modules/time/tests/time.test.ts, modules/time/tests/helpers.ts, modules/time/tests/e2e/time.spec.ts, modules/time/tests/e2e/playwright.config.ts, modules/time/tests/e2e/setup.ts, modules/time/tests/e2e/diff.ts
  Depends: T5

## Verify

Quality: 58 → 58 duplicated lines (repo-wide). The 17 lines in `modules/time` that repeat delivery (`server/context.ts` ctxFor and the typed MCP `tool()` helper) can only be shared from a platform package, which is a separate platform-lane change; not refactored here.
