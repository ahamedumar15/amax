# Notifications: in-app, email and Teams

**Change:** 030-notifications · **Created:** 2026-10-17
**Lane:** Platform · **Module:** `modules/notifications` · **Depends on:** [002](../002-identity-and-access/change.md), [003](../003-data-core/change.md), [029](../029-workflows-scheduler/change.md)

## Problem

Every module needs to tell someone something: a timesheet to approve, a release rolled back, leave approved, a payslip ready, a suggestion waiting. If each module sends its own emails and Teams messages, people get spammed, preferences are ignored, and nothing is auditable. One module turns domain events into notifications, respecting roles, data scope and preferences.

## Mock Delta

What changes on screen, and where to see it: [`001-amax-foundation`](../../mock/index.html#001-amax-foundation)

The bell in the top bar opens a notification list (unread first, grouped by module, each linking to its record). A Notifications page in the profile menu sets channel and digest preferences.

## Acceptance Criteria

1. **AC-1** Modules declare notification rules in their manifest: the triggering event, recipients (a role, the record's owner, or the approver chain), the message template, and urgency. The notifications module subscribes to those events through the 003 outbox. Modules never send messages themselves.
2. **AC-2** Channels: in-app (the bell, with an unread count), email (Microsoft Graph or SMTP adapter) and Microsoft Teams (bot or webhook adapter). Each sits behind an adapter interface, so Slack can be added later.
3. **AC-3** People choose channels per category and can switch to a daily digest. Urgent items (release failed, pay run blocked, SLA about to breach) ignore the digest setting but still respect quiet hours, which are set per entity time zone.
4. **AC-4** Recipients are resolved with the user's data scope and masking rules. A notification never carries pay values unless the recipient may see them, and a test proves it.
5. **AC-5** Delivery runs as a 029 workflow, with retries, dedupe (one notification per event per person) and an audit of what was sent, to whom and on which channel.
6. **AC-6** The bell list is keyboard-accessible, announces new items through the live region, and links to the record with the right screen focused.

## Tasks

- [ ] `T1` — Mock: the bell list and the Notifications page in `<section data-change="030-notifications">` (AC-3, AC-6)
  Files: .specclaw/mock/index.html
- [ ] `T2` — Real screens matching the mock: the bell (unread count, unread first, grouped by module, live-region announcements, links that focus the record) and the Notifications page (channels per category, digest, quiet hours; Ask amax, no forms), on contract stubs; a top-bar slot in the manifest and shell (AC-3, AC-6)
  Files: packages/core/src/module.ts, packages/ui/src/components/TopBar.tsx, apps/web/app/(app)/layout.tsx, apps/web/components/shell/Shell.tsx, apps/web/components/shell/ProfileMenu.tsx, apps/web/components/shell/useRouteFocus.ts, modules/notifications/package.json, modules/notifications/tsconfig.json, modules/notifications/css.d.ts, modules/notifications/module.ts, modules/notifications/contracts.ts, modules/notifications/ui/*
  Depends: T1
- [ ] `T3` — Schema and services: notifications, deliveries (one per event per person per channel), preferences and quiet hours in the `notifications` schema with RLS and retention; reads and writes through defineService (AC-3, AC-5)
  Files: modules/notifications/db/migrations/0001_notifications.sql, modules/notifications/server/*, modules/notifications/module.ts
  Depends: T2
- [ ] `T4` — Rules: modules declare `notifications` rules (event, recipients: role / owner / approver chain, template, urgency, category) in their manifest; one outbox handler per event resolves recipients with their data scope and masks classified payload fields (pay) unless the recipient may see them; time declares its rules (AC-1, AC-4)
  Files: packages/core/src/module.ts, modules/notifications/server/rules.ts, modules/notifications/server/recipients.ts, modules/notifications/server/render.ts, modules/time/module.ts, modules/time/mcp.ts, modules/time/server/decide.ts
  Depends: T3
- [ ] `T5` — Channel adapters behind one interface: in-app, email (Microsoft Graph) and Teams (incoming webhook), sending through the egress guard with secrets from 031 (AC-2)
  Files: modules/notifications/server/adapters.ts, packages/api/src/egress.ts, packages/core/src/secrets/connectors.ts
  Depends: T3
- [ ] `T6` — Delivery as 029 workflows: one run per delivery (durable wait for quiet hours, retried send, audited record), a per-entity daily digest, and a host hook so modules can start runs (AC-3, AC-5)
  Files: packages/workflows/src/host.ts, packages/workflows/src/index.ts, packages/workflows/src/zone.ts, modules/notifications/server/deliver.ts, modules/notifications/server/digest.ts, modules/notifications/server/quiet.ts, apps/web/lib/server.ts
  Depends: T4, T5
- [ ] `T7` — Chat and MCP: read tools for every pin (get_notifications, get_notification, get_notification_preferences) and confirm-gated write tools (set_notification_preference, set_quiet_hours, mark_notifications_read); fixtures, README and tests, including the pay-masking test and e2e for the bell and the page (AC-1–AC-6)
  Files: modules/notifications/mcp.ts, modules/notifications/fixtures/*, modules/notifications/README.md, modules/notifications/tests/*, apps/web/tests/e2e/notifications.spec.ts, apps/web/playwright.auth.config.ts, apps/web/playwright.config.ts, .github/CODEOWNERS
  Depends: T6
