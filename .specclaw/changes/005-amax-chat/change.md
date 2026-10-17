# amax chat: one assistant, chat-first create, pins, voice

**Change:** 005-amax-chat · **Created:** 2026-10-17
**Lane:** Platform · **Module:** `packages/chat, packages/ui (chat components)` · **Depends on:** [002](../002-identity-and-access/change.md), [003](../003-data-core/change.md), [004](../004-mcp-gateway/change.md)

## Problem

Records are added through one chat instead of forms, and anything on screen can be pinned as context. Modules should only declare intents; the chat engine, UI, voice and pinning are shared.

## Mock Delta

What changes on screen, and where to see it: [`001-amax-foundation-presales`](../../mock/index.html#001-amax-foundation-presales)

The docked chat (open it with Ask amax or ⌘K): grouped bubbles, field-coloured extracted words, a confirm card with Add it, Change something and Cancel, pinned-context chips, pick mode, and the voice button.

## Acceptance Criteria

1. **AC-1** Ask amax, ⌘K and Ctrl+K open the chat. Escape closes it and returns focus. When closed it is inert, so it can't be tabbed into.
2. **AC-2** Modules register chat intents (name, fields, required fields, create service). A create button marked with the intent opens the chat in that mode, with no module UI code.
3. **AC-3** Claude extracts fields from text or speech (Web Speech API, en-AU or en-LK; falls back to typing). amax asks for missing fields and shows a confirm card. "Add it" calls the module service with audit source `chat`; Cancel writes nothing. Each extracted word gets the colour of its field.
4. **AC-4** Cards, rows and stat cards can be pinned with a labelled "Add <name> to chat" button (shown on focus and on touch), by dragging, or in pick mode. Pins become chips, and answers fetch pinned records through MCP with the user's permissions.
5. **AC-5** Answers that used tools show which tools ran. A user without permission gets the same refusal the page would give.

## Tasks

## Verify
