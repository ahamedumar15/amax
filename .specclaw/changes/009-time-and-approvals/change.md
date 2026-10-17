# Time: timesheets and approvals

**Change:** 009-time-and-approvals · **Created:** 2026-10-17
**Lane:** Delivery · **Module:** `modules/time` · **Depends on:** [007](../007-delivery-projects/change.md), [002](../002-identity-and-access/change.md) · **Integrates with (optional):** [011](../011-hr-core/change.md)

## Problem

Team timesheets with agent-logged hours, submit, approve, reject with comment and period lock.

## Mock Delta

What changes on screen, and where to see it: [`001-amax-foundation-time`](../../mock/index.html#001-amax-foundation-time)

Team time: hours per day, the timesheets table, Approve/Remind, and the My timesheet switch.

## Acceptance Criteria

1. **AC-1** `time` schema: entry, week and approval. Weeks follow ISO weeks; fixtures use week 42 of 2026 (Oct 12–16).
2. **AC-2** Approvals follow the manager or project chain. Reject requires a comment. Approved weeks are locked, and changing a locked week needs Admin and is audited.
3. **AC-3** The Time screen matches the mock within a 2% visual diff. Team total and agent share match fixtures.md (141.5 h, 64%).
4. **AC-4** Chat intent "log time". MCP: `log_time`, `submit_week`, `approve_week`.
5. **AC-5** The module meets `docs/module-standard.md`: it changes nothing outside `modules/<name>/` (apart from its CODEOWNERS line); its `contracts.ts` is published first and has contract tests; it has a README, fixtures and a manifest; it can be switched off; and every optional integration degrades gracefully when the other module isn't installed.

## Tasks

## Verify
