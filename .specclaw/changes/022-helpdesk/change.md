# Helpdesk: IT, HR and facilities queues

**Change:** 022-helpdesk · **Created:** 2026-10-17
**Lane:** IT · **Module:** `modules/helpdesk` · **Depends on:** [002](../002-identity-and-access/change.md), [003](../003-data-core/change.md), [006](../006-agent-governance/change.md)

## Problem

Replace the external service desk with queues, SLAs and a support agent.

## Mock Delta

What changes on screen, and where to see it: [`001-amax-foundation-helpdesk`](../../mock/index.html#001-amax-foundation-helpdesk)

Helpdesk: queues, tickets per week, categories, queue table with SLA, and the Facilities empty state.

## Acceptance Criteria

1. **AC-1** Tickets from Teams, email and chat. Queues per team, with separate response and resolution SLAs.
2. **AC-2** The support agent resolves only through approved actions (for example, access requests approved by the owner). HR tickets are visible only to HR.
3. **AC-3** Chat intent "new ticket".

## Tasks

## Verify
