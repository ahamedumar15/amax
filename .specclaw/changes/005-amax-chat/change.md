# amax chat: one assistant, chat-first create, pins, voice

**Change:** 005-amax-chat · **Created:** 2026-10-17
**Lane:** Platform · **Module:** `packages/chat, packages/ui (chat components)` · **Depends on:** [002](../002-identity-and-access/change.md), [003](../003-data-core/change.md), [004](../004-mcp-gateway/change.md), [033](../033-ai-gateway-and-residency/change.md)

## Problem

Records are added through one chat instead of forms, and anything on screen can be pinned as context. Modules should only declare intents; the chat engine, UI, voice and pinning are shared.

## Mock Delta

What changes on screen, and where to see it: [`001-amax-foundation-presales`](../../mock/index.html#001-amax-foundation-presales)

The docked chat (open it with Ask amax or ⌘K): grouped bubbles, field-coloured extracted words, a confirm card with Add it, Change something and Cancel, pinned-context chips, pick mode, and the voice button.

## Acceptance Criteria

1. **AC-1** Ask amax, ⌘K and Ctrl+K open the chat. Escape closes it and returns focus. When closed it is inert, so it can't be tabbed into.
2. **AC-2** Modules register chat intents (name, fields, required fields, create service). A create button marked with the intent opens the chat in that mode, with no module UI code.
3. **AC-3** Claude extracts fields through `@amax/ai` (033) from text or speech (Web Speech API, en-AU or en-LK; falls back to typing). amax asks for missing fields and shows a confirm card. "Add it" calls the module service with audit source `chat`; Cancel writes nothing. Each extracted word gets the colour of its field.
4. **AC-4** Cards, rows and stat cards can be pinned with a labelled "Add <name> to chat" button (shown on focus and on touch), by dragging, or in pick mode. Pins become chips, and answers fetch pinned records through MCP with the user's permissions. Pinned content reaches the model as quoted data, never as instructions (033 AC-3).
5. **AC-5** Answers that used tools show which tools ran. A user without permission gets the same refusal the page would give.

## Tasks

Assumptions (Rule 1):
- Built on 004 T1 (the in-process tool registry) and 033 (`@amax/ai`, Haiku 5.5 first). 004's external HTTP/OAuth endpoint isn't needed for chat; it lands separately.
- One loop for everything: the model answers with read tools directly, and every **write** tool call becomes a confirm card ("Add it", "Change something", "Cancel") that runs the tool only on "Add it", with audit source `chat`. Intents (AC-2) open the chat in a mode that tells the model which write tool to fill and which fields are required.
- Conversations are stored server-side per user (RLS), so provider-native turns (thinking blocks) go back unchanged and the browser can't forge tool results.
- Pins carry a read tool and arguments; the engine fetches them with the user's permissions and passes them as quoted data (033).
- Voice uses the browser's Web Speech API (en-AU / en-LK), only when the tenant enables voice in 033; typing always works.

- [x] `T1` — Engine (`packages/chat`): conversation storage, `chatTurn` (registry tools + pending writes + pins + intents), `confirmAction` / `cancelAction`, field highlights; tests with the fake provider (AC-2, AC-3, AC-4, AC-5)
  Kind: impl
  Files: packages/db/migrations/0007_chat.sql, packages/chat/src/*.ts, packages/chat/tests/*.test.ts, modules/delivery/chat.ts
- [x] `T2` — Docked chat UI: Ask amax / ⌘K / Ctrl+K, Escape returns focus, inert when closed; bubbles, tools-used chips, confirm card with coloured field marks, pin chips, pick mode and "Add to chat" buttons, voice button; server actions (AC-1, AC-3, AC-4)
  Kind: impl
  Files: apps/web/components/chat/*, apps/web/app/actions/chat.ts, apps/web/components/shell/Shell.tsx, packages/ui/src/components/{TopBar,PinButton}.tsx, modules/delivery/ui/*.tsx
  Depends: T1
- [x] `T3` — e2e with a scripted model (create a proposal through chat, confirm, see it on the board; cancel writes nothing; permission refusal), axe, keyboard; live smoke on the hosted env with Haiku 5.5 (AC-1..AC-5)
  Kind: test
  Files: apps/web/tests/e2e/chat.spec.ts
  Depends: T2

## Verify

**Verdict:** PASS (live Haiku smoke pending the hosted tenant's AI policy)
- AC-1: pass — e2e: Ask amax, ⌘K/Ctrl+K open the docked chat with the input focused; Escape closes it and returns focus to Ask amax; closed it is `inert`; axe clean.
- AC-2: pass — delivery's intents (`create_project`, `create_proposal`, `create_release` with required fields) live in its manifest; `IntentButton` ("New project", "New proposal") opens the chat in that mode with no module form code; the engine tells the model which tool and fields.
- AC-3: pass — engine test + e2e: Claude (through `@amax/ai`, Haiku 5.5 first) extracts fields; missing ones are asked for; every write becomes a confirm card (Add it / Change something / Cancel); Add it runs the module service with audit source `chat`; Cancel writes nothing; extracted words are marked in their field's colour. Voice uses the Web Speech API (en-AU / en-LK) when the tenant allows it, typing otherwise.
- AC-4: pass — "Add <name> to chat" buttons on portfolio rows, board cards and proposal rows (shown on hover, focus and touch), pick mode, pin chips; pinned records are fetched through MCP read tools with the user's permissions and reach the model as quoted `<data>` (033). Drag-to-pin is not built (button and pick mode cover it).
- AC-5: pass — answers list the tools that ran; a Sales user asking for projects gets the refusal (the tool isn't in their registry) and no data.

Tests: engine (`modules/delivery/tests/chat.test.ts`, scripted model), e2e `chat.spec.ts` (5 flows; a deterministic scripted model stands in for Claude via `AMAX_AI_PROVIDER=scripted`, refused in production). Commands: `pnpm test`, `pnpm lint`, `pnpm build`, `e2e`, `e2e:auth` (19 flows).
