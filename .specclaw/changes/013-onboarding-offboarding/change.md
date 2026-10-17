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

## Verify
