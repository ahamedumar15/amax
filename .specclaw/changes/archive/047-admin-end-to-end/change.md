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

- [x] `T1` — Settings hub at `/settings` with live status chips, "Coming soon" cards, Audit and trace (050) and AI usage (048) links, pins; nav entry and profile-menu link (AC-1, AC-5)
  Files: apps/web/app/(app)/settings/page.tsx, apps/web/app/(app)/settings/settings.css, apps/web/lib/settings-status.ts, apps/web/lib/registry.ts, apps/web/components/shell/ProfileMenu.tsx
- [x] `T2` — Keys, Integrations, AI and data and Scheduler go chat-first: forms and server actions removed, every write is an "Ask amax" chip with the record pinned, every ticket, card and row pinned; time-zone message asks for `set_entity_zone`; Scheduler GET stops syncing schedules (AC-2, AC-5, AC-6)
  Files: apps/web/components/settings/AskButton.tsx, apps/web/app/(app)/settings/keys/*, apps/web/app/(app)/settings/ai/*, apps/web/app/(app)/settings/integrations/page.tsx, apps/web/app/(app)/settings/workflows/*, apps/web/components/workflows/RunsCard.tsx, apps/web/components/workflows/SchedulesCard.tsx
  Depends: T1
- [x] `T3` — AI policy, MCP client revoke and entity time zone write through `defineService()` (authorized, audited with actor, event) (AC-3, AC-6)
  Files: packages/ai/src/admin.ts, packages/mcp/src/admin.ts, packages/workflows/src/control.ts, packages/workflows/src/server.ts
- [x] `T4` — Admin MCP tools: writes `put_secret`, `rotate_secret`, `revoke_secret`, `revoke_mcp_client`, `set_ai_policy`, `control_workflow_run`, `set_schedule_enabled`, `set_entity_zone`; reads `get_secret_meta`, `get_mcp_client`, `get_ai_policy`, `get_workflow_run`, `get_schedule` (+ list reads for tickets and the hub). Secret-input contract: a tool may declare a field the model never fills (AC-2, AC-4, AC-5)
  Files: apps/web/lib/admin-tools.ts, apps/web/lib/server.ts, packages/core/src/module.ts, packages/mcp/src/registry.ts, packages/chat/src/engine.ts
  Depends: T3
- [x] `T5` — Masked secret field in chat's confirm card, posting straight to a server action bound to that pending action (AC-4)
  Files: apps/web/components/chat/SecretConfirm.tsx, apps/web/components/chat/Chat.tsx, apps/web/app/actions/chat.ts
  Depends: T4
- [x] `T6` — Unit tests: each tool Admin-only and confirm-gated; services audited and emitting events; no write form on the four screens; secret absent from model input, chat.conversation, ai.call, audit, logs (AC-2, AC-3, AC-4, AC-6)
  Files: apps/web/tests/admin-tools.test.ts, apps/web/tests/admin-no-forms.test.ts
  Depends: T2, T4, T5
- [x] `T7` — Scripted model learns rotate and pause; e2e: pin, ask, confirm a rotation with the masked field ("Rotated today", value absent from HTML); pin, ask, confirm a schedule pause; Admin-only 404s and chat refusals; existing 029/031/033/004 specs moved to the chat flow (AC-6, AC-7)
  Files: packages/ai/src/scripted.ts, apps/web/tests/e2e/admin.spec.ts, apps/web/tests/e2e/secrets.spec.ts, apps/web/tests/e2e/workflows.spec.ts, apps/web/tests/e2e/ai.spec.ts, apps/web/tests/e2e/mcp.spec.ts, apps/web/playwright.auth.config.ts
  Depends: T6

## Verify

**Verdict:** PASS
- AC-1: pass — `/settings` hub (`app/(app)/settings/page.tsx`, `lib/admin/status.ts`): Connections and keys, Integrations, AI and data, AI usage (048 link), Scheduler, Audit and trace (050 link) with live chips, plus Data retention, Backups and export, API and webhooks as "Coming soon"; ordered by what needs attention. Nav "Settings" entry (Admin only via `settings:read`) and profile-menu link. e2e `admin.spec.ts` "047 AC1" incl. axe.
- AC-2: pass — no `<form>`, server action or service import on the hub and four screens (`tests/admin/no-forms.test.ts`; e2e asserts `main form, main dialog` = 0 on all five). The eight write tools exist (`lib/admin/*`), are Admin only and run only after confirm (`tests/admin/tools.test.ts` "AC2": refused for an Engineer over MCP, not offered to their chat, nothing written before confirmAction).
- AC-3: pass — every tool writes through `defineService()`: new `setAiPolicy`, `revokeMcpClient`, `setEntityZone`; secrets and workflows already did (029's control.ts finding was fixed before this change). "AC3" test: audit rows `secrets.credential.put/revoke`, `auth.oauth.client_revoked`, `ai.policy.update`, `workflows.run.pause`, `workflows.schedule.toggle`, `workflows.entity_zone.set`, all `user:<maya> chat`, each with its outbox event.
- AC-4: pass — `SecretConfirm.tsx` (uncontrolled password input, cleared on submit) posts to `confirmSecretChat(conversationId, actionId, FormData)`; tools declare `secretInput`, so the value is never tool input. `tests/admin/secret.test.ts`: value absent from every table (chat.conversation, ai.call, core.audit_event, core.idempotency, ...), from every provider call (incl. a follow-up turn) and from console output; the MCP path refuses a value as input; a model-invented `value` field is dropped. e2e: value absent from page HTML after confirm and after reload.
- AC-5: pass — every ticket, card and row on the five screens has a `PinButton` (e2e `unpinned()` empty on all five). Read tools: `get_secret_meta`, `get_mcp_client`, `get_ai_policy`, `get_workflow_run`, `get_schedule`, plus `list_secrets`, `list_mcp_clients`, `get_mcp_tool`, `list_schedules`, `list_workflow_runs`, `settings_overview`.
- AC-6: pass — Scheduler GET no longer calls `syncSchedules()` (static test; the e2e seed syncs once, the tick does it in production); "set the entity's time zone" now carries an Ask chip for `set_entity_zone` (unit test sets AU's zone and its per-entity schedule takes it); non-Admin e2e asserts HTTP 404 + not-found page on all five screens (029/031/033 specs too) and that chat refuses the admin writes. No page server actions are left to refuse; chat's confirm path refuses via the registry (unit test).
- AC-7: pass — e2e "pin a credential, ask to rotate, confirm with the masked field" shows "Rotated today" and keeps "Expires in 12 days"; "pin a schedule, ask to pause it, confirm" shows "Paused". Typecheck, unit tests, lint and the full e2e suites are green.

Commands (exit codes; DB tests with `DATABASE_MIGRATE_URL=postgres://amax:amax@127.0.0.1:5440/amax`):
- `pnpm lint` → 0 (tsc in every package + graph check ok)
- `pnpm test` → 0 (16/16 turbo tasks; web 36 tests incl. 6 new)
- `pnpm --filter @amax/web build` → 0
- `apps/web: playwright test --config playwright.auth.config.ts` (E2E_DB=amax_e2e_047) → 0 (38 passed)
- `apps/web: playwright test` → 0 (1 passed)
- `modules/presales e2e` (scripted.ts shared with 046) → 0 (6 passed)
- `specclaw-preset-check .` → 1: repo-wide (672), as recorded for 041/045/046. In this change's files only the comment rule (the repo's own style) and `tests/e2e/admin.spec.ts` at 105 lines.
- `specclaw-quality-scan . --gate` → not run: aborts with `jq: Argument list too long` on this repo.

Screenshots: `shots/app.png` (Keys) vs `shots/mock.png` (mock 047); `shots/confirm.png` (masked field on the confirm card); `shots/hub.png` vs `shots/mock-hub.png` (mock 038-settings); `shots/scheduler.png`.
Differences from the mock: Keys keeps 031's four tickets and full table; the header chip reads "Ask amax to add a credential" as in 047. The 031 visual-diff test now skips the header region.

Review: specclaw-review loop skipped (operator's review cadence: one review at module end, not per change).
