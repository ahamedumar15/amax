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

- [ ] `T1` — Onboarding screen (`/onboarding`): what needs attention first (overdue tasks, joiners starting soon, leavers this week), then each person's checklist with tasks by owner. Every row and tile is pinned, and "Ask amax" handles completing a task (AC-1)
  Files: modules/onboarding/ui/OnboardingPage.tsx, modules/onboarding/ui/onboarding.css, modules/onboarding/module.ts, modules/onboarding/tests/e2e/onboarding.spec.ts
- [x] `T2` — Contracts first, then data. `contracts.ts` gets events and types. Templates by legal entity and role are fixtures. `hr.person.joined` and `left` start a checklist whose tasks go to owners (HR, IT Admin, the manager). MCP tools `list_checklists`, `get_checklist`, `complete_checklist_task` (AC-1)
  Files: modules/onboarding/contracts.ts, modules/onboarding/db/migrations/0001_onboarding.sql, modules/onboarding/server/*.ts, modules/onboarding/mcp.ts, modules/onboarding/fixtures/, modules/onboarding/tests/onboarding.test.ts, modules/onboarding/tests/contracts.test.ts
- [ ] `T3` — IT access: a grant on joining, a revoke on leaving, as `onboarding.access.requested` plus an IT Admin task. Nothing is revoked automatically, and it degrades without 021 (AC-2)
  Files: modules/onboarding/server/access.ts, modules/onboarding/tests/access.test.ts
  Depends: T2
- [ ] `T4` — Exit questionnaire: a single-use link token that expires after 14 days. The public page records the answers once, and the token is stored hashed (AC-3)
  Files: modules/onboarding/server/exit.ts, modules/onboarding/ui/ExitPage.tsx, modules/onboarding/tests/exit.test.ts
  Depends: T2
- [ ] `T5` — Module standard: README, manifest, CODEOWNERS line, retention entries, can be switched off, standard test (AC-4)
  Files: modules/onboarding/README.md, modules/onboarding/package.json, .github/CODEOWNERS, modules/onboarding/tests/standard.test.ts
  Depends: T3, T4

## Verify
