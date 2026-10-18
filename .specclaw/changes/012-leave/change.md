# Leave and holidays

**Change:** 012-leave · **Created:** 2026-10-17
**Lane:** People · **Module:** `modules/leave` · **Depends on:** [011](../011-hr-core/change.md) · **Integrates with (optional):** [007](../007-delivery-projects/change.md)

## Problem

Leave requests, balances, team calendar, holidays and approvals, with rules from country packs.

## Mock Delta

What changes on screen, and where to see it: [`001-amax-foundation-leave`](../../mock/index.html#001-amax-foundation-leave)

Leave: stats, leave by type, days per month, team calendar with today and holidays, requests with clash checks.

## Acceptance Criteria

1. **AC-1** `leave` schema: policy (from country pack), balance, request, holiday. Sri Lanka pack: annual 14, casual 7, medical 7, lieu, and Poya and public holidays. Australia pack: annual, personal/carer's, long service. Medical reasons and certificates are `sensitive: 'health'`, visible to HR and the person only.
2. **AC-2** Requests support half days, cancel, approve and reject. Clash checks use delivery releases (through the contract).
3. **AC-3** Chat intent "request leave". Event `leave.approved`, consumed by payroll and time.
4. **AC-4** The module meets `docs/module-standard.md`: it changes nothing outside `modules/<name>/` (apart from its CODEOWNERS line); its `contracts.ts` is published first and has contract tests; it has a README, fixtures and a manifest; it can be switched off; and every optional integration degrades gracefully when the other module isn't installed.

## Tasks

- [x] `T1` — Mock: make the Leave section chat-first: "Ask amax to request leave", Ask amax to approve or decide each request (named by request id), and a pin on every stat, chart, calendar row and request row (AC-2, AC-3)
  Files: .specclaw/mock/index.html
- [x] `T2` — Publish `contracts.ts`: leave types, request statuses, event names and payloads (`leave.requested`, `leave.approved`, `leave.rejected`, `leave.cancelled`), `approvedLeave(tx, reader, range)` and `balancesFor(tx, reader, personId)` reads for payroll and time, with contract tests (AC-3, AC-4)
  Files: modules/leave/contracts.ts, modules/leave/package.json, modules/leave/tsconfig.json, modules/leave/css.d.ts, modules/leave/tests/contracts.test.ts, pnpm-lock.yaml
- [x] `T3` — Leave screen matching the mock section: stats, leave by type, days per month, team calendar with today and holidays, requests waiting for you with clash checks; IntentButton and Ask amax buttons, pins on every card, stat and row (AC-1, AC-2, AC-3)
  Files: modules/leave/ui/LeavePage.tsx, modules/leave/ui/Calendar.tsx, modules/leave/ui/Requests.tsx, modules/leave/ui/charts.tsx, modules/leave/ui/AskButton.tsx, modules/leave/ui/prompts.ts, modules/leave/ui/parts.tsx, modules/leave/ui/leave.css
  Depends: T2
- [x] `T4` — `leave` schema (policy, balance, request, holiday, release window, clock pin; RLS on tenant_id), Sri Lanka and Australia country packs (types, entitlements, Poya and public holidays), fixtures consistent with fixtures.md (AC-1)
  Files: modules/leave/db/migrations/0001_leave.sql, modules/leave/packs.ts, modules/leave/fixtures/index.ts, modules/leave/fixtures/history.ts
  Depends: T2
- [x] `T5` — Services through `defineService()`: request (half days, working days less holidays, balance), approve, reject (comment), cancel, apply country pack; clash checks against release windows; reads that mask medical reasons and certificates (`health`: HR and the person only); MCP read and write tools (AC-1, AC-2)
  Files: modules/leave/server/*.ts, modules/leave/mcp.ts
  Depends: T4
- [x] `T6` — Chat intent "request leave"; manifest (group People, grants, retention, events and payloads, the `delivery.release.deployed` handler that keeps release windows, degrading when delivery isn't installed); README; CODEOWNERS line (AC-2, AC-3, AC-4)
  Files: modules/leave/chat.ts, modules/leave/module.ts, modules/leave/server/releases.ts, modules/leave/README.md, .github/CODEOWNERS
  Depends: T5
- [x] `T7` — Tests: schema, RLS and retention columns; fixtures totals; services (half days, cancel, approve, reject, balance, clash); permissions and health masking; chat-first (writes wait for confirm, pins resolve); with and without delivery; module standard; screen a11y e2e (AC-1..AC-4)
  Files: modules/leave/tests/*.ts, modules/leave/tests/e2e/*
  Depends: T6

## Verify
