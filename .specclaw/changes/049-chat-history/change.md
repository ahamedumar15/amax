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

## Verify
