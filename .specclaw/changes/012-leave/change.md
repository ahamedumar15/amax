# Leave and holidays

**Change:** 012-leave · **Created:** 2026-10-17
**Lane:** People · **Module:** `modules/leave` · **Depends on:** [011](../011-hr-core/change.md)

## Problem

Leave requests, balances, team calendar, holidays and approvals, with rules from country packs.

## Mock Delta

What changes on screen, and where to see it: [`001-amax-foundation-leave`](../../mock/index.html#001-amax-foundation-leave)

Leave: stats, leave by type, days per month, team calendar with today and holidays, requests with clash checks.

## Acceptance Criteria

1. **AC-1** `leave` schema: policy (from country pack), balance, request, holiday. Sri Lanka pack: annual 14, casual 7, medical 7, lieu, and Poya and public holidays. Australia pack: annual, personal/carer's, long service.
2. **AC-2** Requests support half days, cancel, approve and reject. Clash checks use delivery releases (through the contract).
3. **AC-3** Chat intent "request leave". Event `leave.approved`, consumed by payroll and time.

## Tasks

## Verify
