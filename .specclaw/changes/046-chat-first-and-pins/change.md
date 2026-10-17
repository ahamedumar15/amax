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

- [x] `T1` — Opportunity page chat-first: hint line, "Ask amax" chips with the opportunity pinned, tasks/risks as pinned table rows, pins on every card and stage step (AC-1, AC-2, AC-4)
  Files: modules/presales/ui/OpportunityPage.tsx, modules/presales/ui/AskButton.tsx, modules/presales/ui/TasksRisks.tsx, modules/presales/ui/ActivitiesCard.tsx, modules/presales/ui/DetailsCard.tsx, modules/presales/ui/HistoryCard.tsx, modules/presales/ui/StageSteps.tsx, modules/presales/ui/PromoteCard.tsx, modules/presales/ui/LostDialog.tsx, modules/presales/ui/presales.css
- [x] `T2` — Board chat-first: deal tiles, suggestion strip, pipeline rows, stat cards, chart and feed get pins; move/remove/accept/dismiss become Ask chips (AC-1, AC-2, AC-4)
  Files: modules/presales/ui/BoardPage.tsx, modules/presales/ui/DealCard.tsx, modules/presales/ui/MoveControls.tsx, modules/presales/ui/FoundStrip.tsx, modules/presales/ui/PipelineList.tsx, modules/presales/ui/StageFeed.tsx
  Depends: T1
- [x] `T3` — MCP write tools close_opportunity_risk, remove_opportunity, resolve_suggestion; drop the presales form actions; unit tests incl. no-form/no-direct-write guard (AC-1, AC-3)
  Files: modules/presales/mcp.ts, modules/presales/actions.ts, modules/presales/tests/chat-first.test.ts
- [x] `T4` — Chat pre-fills the prompt when opened with a pin and no intent (AC-2)
  Files: apps/web/components/chat/Chat.tsx
- [x] `T5` — Pin coverage in time, allocations, HR and delivery cards and rows (AC-5)
  Files: modules/time/ui/*.tsx, modules/allocations/ui/*.tsx, modules/hr/ui/*.tsx, modules/delivery/ui/ReleasePage.tsx, modules/delivery/ui/EnvironmentsCard.tsx
- [x] `T6` — Follow-up backlog of inline forms left in other modules (AC-6)
  Files: BACKLOG.md
- [x] `T7` — E2E: presales chat-first spec (pin → ask to add a task → confirm), pin coverage spec; scripted model learns "add task" (AC-1, AC-4, AC-5, AC-7)
  Files: modules/presales/tests/e2e/presales.spec.ts, packages/ai/src/scripted.ts, apps/web/tests/e2e/pins.spec.ts
  Depends: T1, T2, T3, T4, T5

## Verify

**Verdict:** PASS
- AC-1: pass — `modules/presales/tests/chat-first.test.ts` (no `<form>`/`<dialog>`/server action/service import in presales UI, `actions.ts` gone); e2e `chat-first.spec.ts` asserts `main form, main dialog` count 0 on board and opportunity page
- AC-2: pass — e2e: Move/Add-find chips open chat with the deal/find pinned and the prompt pre-filled (`Chat.tsx` now fills the prompt when no intent); opportunity page shows the five Ask amax chips
- AC-3: pass — `close_opportunity_risk`, `remove_opportunity`, `resolve_suggestion` in `mcp.ts`; `chat-first.test.ts` runs each through chatTurn → pending card → nothing written → confirmAction → written, audit source `chat`
- AC-4: pass — e2e `unpinned()` is empty on board and opportunity page (cards, tiles, tickets, rows, stage steps, finds, feed items); row pins resolve via new read tool `get_opportunity_item`
- AC-5: pass — `apps/web/tests/e2e/pins.spec.ts`: every `.card`, `.tcard`, `tbody tr` on /time/w/2026-W42, /time/my/2026-W42, /allocations, /hr/p/LL-0417, /delivery/p/HRI and a release page has `.pin[data-pin]` (screen-reader chart tables and colspan empty rows excluded)
- AC-6: pass — `BACKLOG.md` lists the remaining inline forms and their write tools
- AC-7: pass — typecheck, unit tests and all e2e green; `chat-first.spec.ts` "AC7 pin the opportunity, ask to add a task, confirm" passes

Commands (exit codes):
- `pnpm lint` → 0 (tsc in every package + graph check ok)
- `DATABASE_MIGRATE_URL=… pnpm test` → 0 (16/16 turbo tasks)
- `pnpm --filter @amax/web build` → 0
- `modules/presales: pnpm e2e` → 0 (6 passed)
- `modules/time: pnpm e2e` → 0 (2 passed)
- `apps/web: pnpm e2e:auth` → 0 (34 passed, incl. pins.spec)
- `specclaw-preset-check .` → 1: 644 repo-wide violations, all pre-existing (code comments and file length in files written before the preset); none introduced by this change
- `specclaw-quality-scan . --gate` → not run: the tool aborts with `jq: Argument list too long` on this repo

Screenshots: `shots/opp.png` (app, opportunity page) vs `shots/mock.png` (mock 046); also `shots/board.png`, `shots/win-*.png`, `shots/chart-*.png`.
Differences from the mock: no "Change details" chip (no `update_opportunity` write tool yet, backlogged).

Review: specclaw-review skipped by operator preference (one review at module end).
