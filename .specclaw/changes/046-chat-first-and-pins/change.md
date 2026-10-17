# Chat-first presales and pins everywhere

**Change:** 046-chat-first-and-pins · **Created:** 2026-10-17

## Problem

Writes on the Presales board and opportunity page go through inline CRUD forms and dialogs (move stage, mark lost, log activity, add task or risk, close risk, promote, remove, accept or dismiss a suggestion). The product intent is that chat does all writes. In-page forms bypass the confirm step and the audit trail. No presales card or row has a pin, and several cards in time, allocations, HR and delivery have none either, so they can't be pinned into chat context.

## Mock Delta

What changes on screen, and where to see it: [`046-chat-first-and-pins`](../../mock/index.html#046-chat-first-and-pins)

- Opportunity page: **Edit / Mark as lost / Move to … / Log activity / Add task / Add risk / Promote** forms are gone. Each one becomes an "Ask amax" chip that opens chat with this opportunity pinned and the prompt pre-filled. The write runs only after chat's confirm step.
- Tasks and risks are table rows, each with a pin, as is every card (details, history, activities, win chance, next step, promote).
- One hint line under the header: "Changes happen in chat. Pin anything, then ask."

## Acceptance Criteria

1. **AC-1** The Presales board and opportunity page render no `<form>` and no write dialog. Move, mark lost, remove, log activity, add task, add risk, close risk, promote and accept/dismiss suggestion are all reachable only through chat. Each page has a test that asserts no `form` element and no direct write action.
2. **AC-2** Each removed form is replaced by an "Ask amax" button. Clicking it opens chat with the current opportunity (or suggestion) pinned and a matching prompt pre-filled.
3. **AC-3** New MCP write tools `close_opportunity_risk`, `remove_opportunity` and `resolve_suggestion` (accept/dismiss) exist. Like every other write, they go through chat's pending-action confirm, and each has a unit test.
4. **AC-4** Every presales card, deal tile, pipeline row, activity/task/risk row, stage step and stat card has a `PinButton`. Each pin resolves through a read tool (`get_opportunity` etc.) to the right record when chat is sent.
5. **AC-5** The same pin coverage applies to cards and rows that lack one today: time (ThisWeek, Timesheets, WeekChart, MyPage), allocations (capacity/bench cards, grid rows), HR (stat cards, documents, employment, ID card, leave), delivery (ReleasePage, EnvironmentsCard). The e2e test passes when every `.card`, `.tcard` and `tbody tr` on these pages has a `.pin[data-pin]`.
6. **AC-6** Inline forms in other modules (time log/submit/approve, allocations copy-month, delivery release edit/deploy/void, environments, project move) are listed in BACKLOG.md as a follow-up change, not removed here.
7. **AC-7** typecheck, unit tests and the existing e2e suite are green, and an updated presales e2e drives "pin opportunity → ask to add a task → confirm" end to end.

## Tasks

## Verify
