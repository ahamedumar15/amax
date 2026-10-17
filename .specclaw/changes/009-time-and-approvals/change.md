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

**Verdict:** PASS

- AC-1: pass — `time.entry` (billable, person/agent source), `time.week` (ISO year/week, lock tied to approval), `time.approval`; RLS on all three, retention columns real, fixtures sit in 2026-W42 starting Oct 12 (`tests/schema.test.ts`, `tests/contracts.test.ts`)
- AC-2: pass — manager chain (with an hr-style reporting line), project chain and Admin; own week refused; reject needs a comment; approved weeks lock; Admin-only change audited as `time.week.locked_change`; reopen Admin-only with a reason (`tests/approvals.test.ts`; e2e approve → Locked)
- AC-3: pass — Team week 141.5 h, 90.2 h by agents (64%), 87.5 h submitted, 68.0/51.5/22.0 by project, per-day 38.1/40.1/30.6/31.7/1.0 (`tests/schema.test.ts`); This week card within 2% of the mock and axe clean (`tests/e2e/time.spec.ts`)
- AC-4: pass — chat intent `time.log` → `log_time`; MCP `log_time`, `submit_week`, `approve_week` run as the caller, audited with source mcp, MCP time is agent time (`tests/mcp.test.ts`)
- AC-5: pass — only `modules/time/`, its CODEOWNERS line and the generated lockfile entry change; contracts published first with tests; README, fixtures, manifest; switch-off check (nothing else imports `@amax/time`); without hr the project chain still routes approvals (`tests/standard.test.ts`)

Commands (exit codes):
- `pnpm lint` → 0 (tsc for every package + `check-graph`: ok, 3 modules)
- `DATABASE_MIGRATE_URL=… pnpm test` → 0 (time 9/9, delivery 115/115, all packages green)
- `pnpm --filter @amax/web build` → 0
- `pnpm --filter @amax/web e2e` → 0 (1/1); `pnpm --filter @amax/web e2e:auth` → 0 (25/25)
- `pnpm --filter @amax/time e2e` → 0 (2/2)
- `specclaw-preset-check .` → 1, `specclaw-quality-scan . --gate` → 1: every violation is in pre-existing files (`modules/delivery`, `apps/web`, `scripts/graph`; high CCN in `delivery/sync/specclaw.ts` `parse` and `settings/ai/page.tsx`); 0 in `modules/time`.

Screenshots: `.specclaw/changes/009-time-and-approvals/shots/app.png` (app, week 42 as Maya), `shots/mock.png` (mock section), `shots/time-app.png` / `shots/time-mock.png` (the diffed This week card).

Quality: 58 → 58 duplicated lines (repo-wide). The 17 lines in `modules/time` that repeat delivery (`server/context.ts` ctxFor and the typed MCP `tool()` helper) can only be shared from a platform package, which is a separate platform-lane change; not refactored here.

Review: specclaw-review per change is off (operator decision); not run.
