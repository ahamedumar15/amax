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

- [ ] `T1` — Settings hub at `/settings` with live status chips, "Coming soon" cards, Audit and trace (050) and AI usage (048) links, pins; nav entry and profile-menu link (AC-1, AC-5)
  Files: apps/web/app/(app)/settings/page.tsx, apps/web/app/(app)/settings/settings.css, apps/web/lib/settings-status.ts, apps/web/lib/registry.ts, apps/web/components/shell/ProfileMenu.tsx
- [ ] `T2` — Keys, Integrations, AI and data and Scheduler go chat-first: forms and server actions removed, every write is an "Ask amax" chip with the record pinned, every ticket, card and row pinned; time-zone message asks for `set_entity_zone`; Scheduler GET stops syncing schedules (AC-2, AC-5, AC-6)
  Files: apps/web/components/settings/AskButton.tsx, apps/web/app/(app)/settings/keys/*, apps/web/app/(app)/settings/ai/*, apps/web/app/(app)/settings/integrations/page.tsx, apps/web/app/(app)/settings/workflows/*, apps/web/components/workflows/RunsCard.tsx, apps/web/components/workflows/SchedulesCard.tsx
  Depends: T1
- [ ] `T3` — AI policy, MCP client revoke and entity time zone write through `defineService()` (authorized, audited with actor, event) (AC-3, AC-6)
  Files: packages/ai/src/admin.ts, packages/mcp/src/admin.ts, packages/workflows/src/control.ts, packages/workflows/src/server.ts
- [ ] `T4` — Admin MCP tools: writes `put_secret`, `rotate_secret`, `revoke_secret`, `revoke_mcp_client`, `set_ai_policy`, `control_workflow_run`, `set_schedule_enabled`, `set_entity_zone`; reads `get_secret_meta`, `get_mcp_client`, `get_ai_policy`, `get_workflow_run`, `get_schedule` (+ list reads for tickets and the hub). Secret-input contract: a tool may declare a field the model never fills (AC-2, AC-4, AC-5)
  Files: apps/web/lib/admin-tools.ts, apps/web/lib/server.ts, packages/core/src/module.ts, packages/mcp/src/registry.ts, packages/chat/src/engine.ts
  Depends: T3
- [ ] `T5` — Masked secret field in chat's confirm card, posting straight to a server action bound to that pending action (AC-4)
  Files: apps/web/components/chat/SecretConfirm.tsx, apps/web/components/chat/Chat.tsx, apps/web/app/actions/chat.ts
  Depends: T4
- [ ] `T6` — Unit tests: each tool Admin-only and confirm-gated; services audited and emitting events; no write form on the four screens; secret absent from model input, chat.conversation, ai.call, audit, logs (AC-2, AC-3, AC-4, AC-6)
  Files: apps/web/tests/admin-tools.test.ts, apps/web/tests/admin-no-forms.test.ts
  Depends: T2, T4, T5
- [ ] `T7` — Scripted model learns rotate and pause; e2e: pin, ask, confirm a rotation with the masked field ("Rotated today", value absent from HTML); pin, ask, confirm a schedule pause; Admin-only 404s and chat refusals; existing 029/031/033/004 specs moved to the chat flow (AC-6, AC-7)
  Files: packages/ai/src/scripted.ts, apps/web/tests/e2e/admin.spec.ts, apps/web/tests/e2e/secrets.spec.ts, apps/web/tests/e2e/workflows.spec.ts, apps/web/tests/e2e/ai.spec.ts, apps/web/tests/e2e/mcp.spec.ts, apps/web/playwright.auth.config.ts
  Depends: T6

## Verify
