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
- [ ] `T5` — Tests: unit/DB tests for title, search, scoping (page action and MCP), expired confirm refused, archive audited; e2e reopen-and-continue with axe (AC-1..AC-6)
  Files: packages/chat/tests/history.test.ts, apps/web/tests/chat-history-action.test.ts, apps/web/tests/e2e/chat.spec.ts
  Depends: T4

## Verify
