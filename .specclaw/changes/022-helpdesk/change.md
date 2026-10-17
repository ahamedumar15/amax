# Helpdesk: IT, HR and facilities queues

**Change:** 022-helpdesk · **Created:** 2026-10-17
**Lane:** IT · **Module:** `modules/helpdesk` · **Depends on:** [002](../002-identity-and-access/change.md), [003](../003-data-core/change.md), [006](../006-agent-governance/change.md) · **Integrates with (optional):** [021](../021-it-access-licences/change.md), [011](../011-hr-core/change.md)

## Problem

Replace the external service desk with queues, SLAs and a support agent.

## Mock Delta

What changes on screen, and where to see it: [`001-amax-foundation-helpdesk`](../../mock/index.html#001-amax-foundation-helpdesk)

Helpdesk: queues, tickets per week, categories, queue table with SLA, and the Facilities empty state.

## Acceptance Criteria

1. **AC-1** Tickets from Teams, email and chat. Queues per team, with separate response and resolution SLAs.
2. **AC-2** The support agent resolves only through approved actions (for example, access requests approved by the owner). It never resets passwords or MFA or changes credentials; those go to IT with identity verification. Email tickets are untrusted: an access request is acted on only when the requester is signed in through Teams or amax. HR tickets are visible only to HR.
3. **AC-3** Chat intent "new ticket".
4. **AC-4** The module meets `docs/module-standard.md`: it changes nothing outside `modules/<name>/` (apart from its CODEOWNERS line); its `contracts.ts` is published first and has contract tests; it has a README, fixtures and a manifest; it can be switched off; and every optional integration degrades gracefully when the other module isn't installed.

## Tasks

## Verify
