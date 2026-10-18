# Learning and development

**Change:** 024-learning · **Created:** 2026-10-17
**Lane:** Talent · **Module:** `modules/learning` · **Depends on:** [011](../011-hr-core/change.md), [029](../029-workflows-scheduler/change.md)

## Problem

Visibility of programmes, who took part, completion and certifications.

## Mock Delta

What changes on screen, and where to see it: [`001-amax-foundation-learning`](../../mock/index.html#001-amax-foundation-learning)

Learning: stats, programmes, participation per month, expiring certifications.

## Acceptance Criteria

1. **AC-1** Programme, enrolment, completion and certification (with expiry). Counts match fixtures.md (18 programmes, 184 in ISO 27001, 126 in optional programmes).
2. **AC-2** Expiry reminders as jobs. Chat intent "new programme".
3. **AC-3** The module meets `docs/module-standard.md`: it changes nothing outside `modules/<name>/` (apart from its CODEOWNERS line); its `contracts.ts` is published first and has contract tests; it has a README, fixtures and a manifest; it can be switched off; and every optional integration degrades gracefully when the other module isn't installed.

## Tasks

- [x] `T1` — Contract first: `contracts.ts` (programme, enrolment and certification refs, expiring-certification read, completion target, events and payloads) with contract tests; manifest (People group, grants, routes, retention, workflow and schedule slots); README; package; CODEOWNERS line (AC-3)
  Files: modules/learning/{module.ts,contracts.ts,package.json,tsconfig.json,css.d.ts,README.md}, modules/learning/tests/contracts.test.ts, .github/CODEOWNERS, pnpm-lock.yaml
- [x] `T2` — The Learning screen matching the mock: lede, four tickets (programmes, people in optional programmes, completion rate against the target, certifications), Programmes table with the All/Running/Done filter, People taking part per month chart, Expiring soon list with Remind; "New programme" opens chat in its intent, Remind is an Ask amax chip; every ticket, card, row and item pinned (AC-1, AC-2)
  Files: modules/learning/ui/*
  Depends: T1
- [x] `T3` — `learning` schema and fixtures: programme, enrolment (with completion), attendance, certification (with expiry), reminder; RLS on tenant_id; fixtures.md counts (18 programmes, 11 internal and 7 external; 184 people completed ISO 27001; 126 people in optional programmes; 74% completion; 41 certifications, 6 expiring before January) (AC-1, AC-3)
  Files: modules/learning/db/migrations/0001_learning.sql, modules/learning/fixtures/*
  Depends: T1
- [ ] `T4` — Services and queries: create programme, enrol people (from hr through its contract), record completion, record certification with expiry, remind about an expiring certification, the daily due-reminder sweep; stats and the monthly participation series (AC-1, AC-2)
  Files: modules/learning/server/*
  Depends: T3
- [ ] `T5` — MCP tools (reads with pin specs, writes behind the confirm), the "new programme" chat intent, search, and the certification-expiry workflow on a daily schedule (AC-2, AC-3)
  Files: modules/learning/{mcp.ts,chat.ts,pins.ts,workflows.ts}
  Depends: T4
- [ ] `T6` — Tests: fixture counts, services and audit, permissions, RLS leak, switch-off, chat intent and write tools through chat's confirm, the reminder workflow, and the module e2e (screen against the mock, pins, axe) (AC-1, AC-2, AC-3)
  Files: modules/learning/tests/*
  Depends: T5

## Verify
