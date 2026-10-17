# Chat-first everywhere

**Change:** 054-chat-first-everywhere · **Created:** 2026-10-17
**Lane:** Delivery · **Modules:** `modules/time`, `modules/allocations`, `modules/delivery` · **Depends on:** [046](../archive/046-chat-first-and-pins/change.md), [051](../051-project-sections/change.md)

## Problem

046 made presales chat-first and listed the in-page write forms it left in other modules (BACKLOG.md, "Chat-first for the remaining modules"). Those forms still write without chat's confirm card, which breaks AGENTS.md rule 1. Row pins on time and allocations also resolve to the whole week or grid, not to the row.

## Mock Delta

What changes on screen, and where to see it: [`054-chat-first-everywhere`](../../mock/index.html#054-chat-first-everywhere)

- My timesheet, Team time, Allocations, Release, Releases, the project board and the Environments card: each write form becomes an "Ask amax" chip that pins the record and fills in the prompt.
- Each timesheet and allocation row pin opens exactly that row.

## Acceptance Criteria

1. **AC-1** None of these screens has a write `<form>`, a write dialog or a server action: My timesheet, Team time (ThisWeek, Timesheets), Allocations (CopyMonth), Release, Releases, the project board and EnvironmentsCard. A unit guard per module, like `modules/presales/tests/chat-first.test.ts`, fails if one comes back.
2. **AC-2** Each removed form becomes an `IntentButton` or "Ask amax" chip with the record pinned and the prompt filled in. Each write goes through the existing MCP tools (`log_time`, `submit_week`, `approve_week`, `remind_week`, `copy_allocations_to_next_month`, `tag_release`, `set_release_proposals`, `record_deployment`, `void_deployment`, `upsert_environment`, `remove_environment`, `move_proposal`). Any tool that's missing is added, with a unit test, and runs only after chat's confirm.
3. **AC-3** New read tools `get_timesheet` (one person-week) and `get_allocation` (one row) resolve the row pins on time and allocations to exactly that record.
4. **AC-4** The presales "Change details" chip comes back, backed by a new `update_opportunity` write tool behind confirm.
5. **AC-5** One e2e test per module drives pin → ask → confirm → screen updated: submit a week, copy a month and record a deployment. The existing e2e specs that used the forms move to the chat flow.
6. **AC-6** The "Chat-first for the remaining modules" section of BACKLOG.md is removed. Typecheck, unit tests, lint and both e2e suites stay green.

## Tasks

## Verify
