# Past chats: list, search and restore

**Change:** 049-chat-history · **Created:** 2026-10-17
**Lane:** Platform · **Module:** `packages/chat` · **Depends on:** [005](../archive/005-amax-chat/change.md)

## Problem

Conversations are already stored server-side (`chat.conversation`), but the chat panel can't show them. "New conversation" drops the current one from view and there's no way back, so a person can't find what they asked last week or carry on from where they stopped.

## Mock Delta

What changes on screen, and where to see it: [`049-chat-history`](../../mock/index.html#049-chat-history)

- The chat panel gets a **History** button. It opens a list of the person's past chats, newest first, each with a title, date, message count and pins, and a search box above it.
- Opening a past chat restores its messages and pins. Pending actions that have expired show as "Expired" and can't be confirmed.

## Acceptance Criteria

1. **AC-1** `chat.conversation` gains `title`, set from the first message (trimmed to 80 characters), and `archived_at`. A migration fills both in for existing rows.
2. **AC-2** The History view lists the signed-in person's conversations, newest first, with title, last updated, message count and a pin on each row. Search matches title and message text. It works by keyboard alone and passes the axe check.
3. **AC-3** Opening a conversation restores its messages, pins and pending actions. A pending action past its expiry shows "Expired" and its confirm is refused by the server (test). Sending a message appends to that same conversation.
4. **AC-4** A person can only list or open their own conversations, Admins included. A test shows user B gets nothing when listing or opening user A's conversation, both through the page action and through MCP.
5. **AC-5** The read tools `list_conversations` and `get_conversation` are scoped to the signed-in person. The write tool `archive_conversation` runs through chat's pending-action confirm and is audited.
6. **AC-6** Typecheck, unit tests, lint and e2e stay green. A new e2e test chats, starts a new conversation, opens History, reopens the first one and continues it.

## Tasks

- [x] `T1` — History view in the chat panel: History button, search, rows with title, date, message count, pins and a PinButton; reopen restores messages, pins and cards, expired cards show "Expired" (AC-2, AC-3)
  Files: apps/web/components/chat/Chat.tsx, apps/web/components/chat/History.tsx, apps/web/app/globals.css
- [x] `T2` — Migration 0020: `title`, `archived_at` and `pins` on `chat.conversation`, backfilled for existing rows; the engine sets the title from the first message and stores the turn's pins (AC-1, AC-3)
  Files: packages/db/migrations/0020_chat_history.sql, packages/chat/src/engine.ts
- [x] `T3` — History reads and the archive service: `listConversations`, `getConversation` scoped to the signed-in person; `archiveConversation` through defineService; MCP tools `list_conversations`, `get_conversation`, `archive_conversation` (AC-4, AC-5)
  Files: packages/chat/src/history.ts, packages/chat/src/index.ts
  Depends: T2
- [x] `T4` — Wire it in: chat tools into the tool registry and grants, page actions `listChats` and `openChat` (AC-2, AC-3, AC-4, AC-5)
  Files: apps/web/lib/server.ts, apps/web/app/actions/chat.ts
  Depends: T3
- [x] `T5` — Tests: unit/DB tests for title, search, scoping (page action and MCP), expired confirm refused, archive audited; e2e reopen-and-continue with axe (AC-1..AC-6)
  Files: packages/chat/tests/history.test.ts, apps/web/tests/chat-history-action.test.ts, apps/web/tests/e2e/chat.spec.ts
  Depends: T4

## Verify

**Verdict:** PASS

- AC-1: pass — `packages/chat/tests/history.test.ts` "AC1" (title from the first message, whitespace collapsed, cut to 80) and `packages/chat/tests/backfill.test.ts` "AC1" (migration 0020 backfills the title of an existing row and archives an empty one).
- AC-2: pass — `history.test.ts` "AC2" (own chats newest first, message and pin counts, search over title and message text, `%`/`_` escaped); e2e `chat.spec.ts` "049 AC6" opens History, searches and opens a row by keyboard only, and runs axe (wcag2a/2aa/21aa/22aa) on the panel with History open: no violations.
- AC-3: pass — `history.test.ts` "AC3": reopening restores messages, pins and cards; an expired card comes back `expired: true` and `confirmAction` is refused with `decision: "expired"`; sending with that id appends to the same conversation. The panel shows an "Expired" chip with no confirm buttons.
- AC-4: pass — `history.test.ts` "AC4" (Sahan, an Admin, gets `[]` / null from the functions, `[]` / `not_found` from the `list_conversations` / `get_conversation` / `archive_conversation` MCP tools, and can't send into the chat) and `apps/web/tests/chat-history-action.test.ts` "AC4" (same through the `listChats` / `openChat` page actions).
- AC-5: pass — `history.test.ts` "AC5": `archive_conversation` becomes a confirm card, nothing changes until confirm, then it runs through `defineService` and the audit row has actor `user:<maya>` and source `chat`. The read tools filter on the signed-in user.
- AC-6: pass — commands below all exit 0; the new e2e test chats, starts a new conversation, opens History, reopens the first chat and continues it.

Commands (DATABASE_MIGRATE_URL pointed at a local Postgres 16):
- `pnpm lint` (tsc in every package + module graph check): exit 0
- `pnpm test`: exit 0 (16 packages; chat 6 tests, web 31 tests)
- `pnpm --filter @amax/web build`: exit 0
- `pnpm --filter @amax/web e2e`: exit 0 (1 passed)
- `pnpm --filter @amax/web e2e:auth` (E2E_DB=amax_e2e_049): exit 0 (34 passed)
- `specclaw-preset-check .`: exit 1. 652 violations across the repo, which predates the lean preset (80-line files, no comments). The new files (`history.ts`, `tools.ts`, `History.tsx`, `chat-history.ts`, the tests) have none; the hits in touched files are existing long files (`Chat.tsx`, `server.ts`, `chat.spec.ts`) and their existing comments. Not treated as a blocker for this change.
- `specclaw-quality-scan . --gate`: did not run (exit 126, `jq: Argument list too long`). Recorded, not fixed here.
- specclaw-review loop: skipped on the operator's review cadence (once per module end, not per change).

Screenshots: `.specclaw/changes/049-chat-history/shots/app.png` (History open), `shots/app-restored.png` (a reopened chat), `shots/mock.png` (mock section). They match: History heading with New chat, search, then rows with title, date and message count. Row pins appear on hover or focus, as elsewhere in the app.

Quality: not_run (specclaw-quality-scan failed on this repo: `jq: Argument list too long`)
