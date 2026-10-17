# Inbox agent: Teams and email to suggestions

**Change:** 025-inbox-agent · **Created:** 2026-10-17
**Lane:** Intelligence · **Module:** `modules/inbox-agent` · **Depends on:** [006](../006-agent-governance/change.md), [005](../005-amax-chat/change.md), [029](../029-workflows-scheduler/change.md)

## Problem

Read the Teams channels and mailboxes a tenant allows and suggest records (opportunities, activities, leave, tickets).

## Mock Delta

What changes on screen, and where to see it: [`001-amax-foundation-presales`](../../mock/index.html#001-amax-foundation-presales)

"Found by agents in Teams and email" with Add, Open in chat and Dismiss.

## Acceptance Criteria

1. **AC-1** Admin consent in Entra and an allow-list of channels and mailboxes per tenant. Nothing is read outside it.
2. **AC-2** Each suggestion links to its source message and is routed to the module that owns the record type, through that module's chat intent.
3. **AC-3** An hourly job, switchable on Insights.
4. **AC-4** The module meets `docs/module-standard.md`: it changes nothing outside `modules/<name>/` (apart from its CODEOWNERS line); its `contracts.ts` is published first and has contract tests; it has a README, fixtures and a manifest; it can be switched off; and every optional integration degrades gracefully when the other module isn't installed.

## Tasks

## Verify
