# Admin end to end: chat-first settings

**Change:** 047-admin-end-to-end · **Created:** 2026-10-17
**Lane:** Platform · **Depends on:** [029](../029-workflows-scheduler/change.md), [031](../031-secrets-and-keys/change.md), [033](../archive/033-ai-gateway-and-residency/change.md), [046](../046-chat-first-and-pins/change.md)

## Problem

The admin screens (Connections and keys, Integrations, AI and data, Scheduler) work only in parts. They write through in-page forms (KeyForm put and revoke, Revoke client, Save policy, run controls, schedule toggle) that skip chat's confirm step. No Settings hub links them. Open follow-ups from 029 and 031 leave gaps: nothing can set an entity's time zone, the page GET syncs schedules for every tenant, and run controls bypass `defineService`.

## Mock Delta

What changes on screen, and where to see it: [`047-admin-end-to-end`](../../mock/index.html#047-admin-end-to-end)

- `/settings` hub lists every admin screen, with a status chip and what needs attention first.
- On Keys, Integrations, AI and data and Scheduler, every write button becomes an "Ask amax" chip, and every ticket, card and row gets a pin.
- A new secret is typed into a masked field inside chat's confirm card. It never enters the chat log or the model's input.

## Acceptance Criteria

1. **AC-1** `/settings` (Admin) shows a hub card for Connections and keys, Integrations, AI and data, Scheduler and the later admin screens (marked "Coming soon"), each with a live status chip. The profile menu and the nav link to it.
2. **AC-2** The four screens contain no write `<form>` (a test checks each one). The writes are MCP tools that run after chat's pending-action confirm: `put_secret`, `rotate_secret`, `revoke_secret`, `revoke_mcp_client`, `set_ai_policy`, `control_workflow_run` (pause, resume, cancel, retry), `set_schedule_enabled` and `set_entity_zone`. Each is Admin-only and has a unit test.
3. **AC-3** Each of those tools writes through `defineService()`: authorized, audited with the person or the agent acting for them, and emitting an event. This replaces the direct `withTenant` writes in `packages/workflows/src/control.ts`.
4. **AC-4** A secret value goes only into a masked input in the confirm card, which posts straight to the server action bound to that pending action. A test asserts the value is absent from `chat.conversation`, `ai.call`, the audit row and the page HTML.
5. **AC-5** Every ticket, card and table row on the five screens (hub included) has a `PinButton` that resolves through a read tool (`get_secret_meta`, `get_mcp_client`, `get_ai_policy`, `get_workflow_run`, `get_schedule`).
6. **AC-6** These follow-ups are closed: the Scheduler page no longer calls `syncSchedules()` on GET, the "set the entity's time zone" message links to `set_entity_zone`, and the Admin-only e2e tests assert the 404 page for non-Admins and that the server actions refuse them.
7. **AC-7** An e2e test pins a credential, asks to rotate it, confirms with a new value in the masked field, and sees the row show "Rotated today". A second test pins a schedule, asks to pause it, confirms, and sees it paused. Typecheck, unit tests, lint and the existing e2e suite stay green.

## Tasks

## Verify
