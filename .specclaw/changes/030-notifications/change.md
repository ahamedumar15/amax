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
