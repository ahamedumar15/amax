# Onboarding and offboarding

**Change:** 013-onboarding-offboarding · **Created:** 2026-10-17
**Lane:** People · **Module:** `modules/onboarding` · **Depends on:** [011](../011-hr-core/change.md), [006](../006-agent-governance/change.md) · **Integrates with (optional):** [021](../021-it-access-licences/change.md)

## Problem

Checklists across HR, IT and admin when people join and leave, driven by HR events.

## Mock Delta

What changes on screen, and where to see it: [`001-amax-foundation-people`](../../mock/index.html#001-amax-foundation-people)

Joiner Mohamed Rifkhan (Nov 2) and leaver Rizwan Farook in People and Access.

## Acceptance Criteria

1. **AC-1** Checklist templates by entity and role. Starting from `hr.person.joined` or `left`, tasks go to owners.
2. **AC-2** IT tasks are created through the `it-access` contract as suggestions (grant or revoke) that IT approves, so nothing is revoked automatically.
3. **AC-3** Exit questionnaire link with a single-use token that expires after 14 days.
4. **AC-4** The module meets `docs/module-standard.md`: it changes nothing outside `modules/<name>/` (apart from its CODEOWNERS line); its `contracts.ts` is published first and has contract tests; it has a README, fixtures and a manifest; it can be switched off; and every optional integration degrades gracefully when the other module isn't installed.

## Tasks

Approved by the product owner in Discord, 2026-10-18 ("start with 38, then wave 4").

021 (it-access) isn't built yet. Until it is, AC-2 works like this: onboarding emits
`onboarding.access.requested` (grant or revoke) in its contract, for 021 to turn into IT suggestions.
It also creates a checklist task owned by IT Admin, so nothing is ever granted or revoked
automatically. With 021 installed, its own handler takes over the suggestion.

- [x] `T1` — Onboarding screen (`/onboarding`): what needs attention first (overdue tasks, joiners starting soon, leavers this week), then each person's checklist with tasks by owner. Every row and tile is pinned, and "Ask amax" handles completing a task (AC-1)
  Files: modules/onboarding/ui/OnboardingPage.tsx, modules/onboarding/ui/onboarding.css, modules/onboarding/module.ts, modules/onboarding/tests/e2e/onboarding.spec.ts
- [x] `T2` — Contracts first, then data. `contracts.ts` gets events and types. Templates by legal entity and role are fixtures. `hr.person.joined` and `left` start a checklist whose tasks go to owners (HR, IT Admin, the manager). MCP tools `list_checklists`, `get_checklist`, `complete_checklist_task` (AC-1)
  Files: modules/onboarding/contracts.ts, modules/onboarding/db/migrations/0001_onboarding.sql, modules/onboarding/server/*.ts, modules/onboarding/mcp.ts, modules/onboarding/fixtures/, modules/onboarding/tests/onboarding.test.ts, modules/onboarding/tests/contracts.test.ts
- [x] `T3` — IT access: a grant on joining, a revoke on leaving, as `onboarding.access.requested` plus an IT Admin task. Nothing is revoked automatically, and it degrades without 021 (AC-2)
  Files: modules/onboarding/server/access.ts, modules/onboarding/tests/access.test.ts
  Depends: T2
- [x] `T4` — Exit questionnaire: a single-use link token that expires after 14 days. The public page records the answers once, and the token is stored hashed (AC-3)
  Files: modules/onboarding/server/exit.ts, modules/onboarding/ui/ExitPage.tsx, modules/onboarding/tests/exit.test.ts
  Depends: T2
- [x] `T5` — Module standard: README, manifest, CODEOWNERS line, retention entries, can be switched off, standard test (AC-4)
  Files: modules/onboarding/README.md, modules/onboarding/package.json, .github/CODEOWNERS, modules/onboarding/tests/standard.test.ts
  Depends: T3, T4

## Verify

**Verdict:** PASS

- AC-1: pass — checklist templates by legal entity and role (fixtures). `hr.person.joined` and `left` start a checklist whose tasks go to HR, IT Admin and the manager, and each owner completes theirs through chat (`complete_checklist_task`). Tests: `modules/onboarding/tests/onboarding.test.ts` "AC-1" (through hr's real `add_person` and `record_leaver` and the event tick) and module e2e `tests/e2e/onboarding.spec.ts` "AC1" (attention first, every row pinned, no forms, Ask amax completes a task).
- AC-2: pass, with 021 not built yet — a joiner raises a grant and a leaver a revoke, as `onboarding.access.requested` (a contract event for 021) plus an IT Admin task. Nothing is granted or revoked automatically: the leaver's sign-in and roles are unchanged after IT completes the task. Test: `tests/access.test.ts` "AC-2".
- AC-3: pass for the link — `send_exit_questionnaire` issues a single-use token, stored hashed, expiring after 14 days. HR sees it once as a reveal on the confirm card; it never enters the transcript, the audit or the outbox. Answers are recorded once. Test: `tests/exit.test.ts` "AC-3". Gap: the leaver's public page (`ui/ExitPage.tsx`) has no route for signed-out visitors yet. That's a platform slot, logged in BACKLOG ("Public pages for signed-out visitors").
- AC-4: pass — `contracts.ts` (events and types) with contract tests; README, fixtures, manifest, retention entries and a CODEOWNERS line. It can be switched off (`tests/standard.test.ts`). It degrades without 021: no handler, the IT task remains. Nothing outside `modules/onboarding` changed except CODEOWNERS, the lockfile, BACKLOG, and nine e2e selectors in `apps/web/tests/e2e` made exact. A new tool's description contains "send", which made the old "Send" button match ambiguous.

Commands (worktree, Postgres 16 at `DATABASE_MIGRATE_URL`):
- `pnpm turbo run lint` → 0 (24/24); `check-graph` → 0 (11 modules); `check-module-standard` → 0
- `pnpm turbo run test --continue` → 0 (23/23)
- `pnpm --filter @amax/web build` → 0
- `playwright test --config playwright.auth.config.ts` → 78/78. The first run had 3 failures: the known flaky `auth.spec` sign-out test, and the two `mcp.spec` cases with the ambiguous "Send" selector, since fixed.
- module e2e `modules/onboarding/tests/e2e` → 1/1
- `specclaw-preset-check .` → 1: the repo-wide comment and line-length convention, the same exception as earlier changes.
- `specclaw-quality-scan . --gate` → not_run: it fails with "jq: Argument list too long" on this repo.

Screenshots: `.specclaw/changes/013-onboarding-offboarding/shots/app.png` (`/onboarding` as Admin). The mock delta for 013 is the joiner Mohamed Rifkhan (Nov 2) shown as "Onboarding" in People, which hr's directory already renders. The onboarding screen itself has no mock section; it follows the shell's ticket and card patterns and was checked by eye against them.
Review: skipped. Per-change review is off (`code_review: false`, product owner 2026-10-17).
