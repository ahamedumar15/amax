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

Approved by the product owner in Discord, 2026-10-18 ("start with 38, then wave 4"); 022 is in wave 4.
How tickets arrive:
- From chat and MCP, through `create_ticket` and the chat intent `helpdesk.new-ticket`.
- From email and Teams, through 025's inbox agent, whose ticket route already expects `helpdesk.ticket`, `helpdesk:ticket:create`, `helpdesk.new-ticket` and `create_ticket`. A person adds each one from a find, and the ticket keeps its channel and a link to the source message.

Who counts as signed in: a requester raising their own ticket in chat or through Teams. Email is never treated as signed in.

What the support agent may do:
- It triages each ticket in 006's untrusted-input mode.
- For an access request from a signed-in requester, it proposes a 006 suggestion that only the resource's owner can approve. Helpdesk keeps its own resource catalogue (resource, owner), set by a write tool.
- On approval it resolves the ticket as "Granted by support agent after <owner> approved" and emits `helpdesk.access.approved`. Making the grant in 021 is a follow-up (BACKLOG).
- Password, MFA and credential requests always go to the IT queue as "Needs identity verification". The agent proposes nothing for them.

The mock's lede says the agent solves "password resets". AC-2 forbids that, so the screen and fixtures don't.
HR tickets and the HR queue are visible only to HR (and Admin).

- [x] `T1` — Helpdesk screen, as in the mock: a lede with the agent's solved share and the tickets close to breaching their SLA; IT, HR and Facilities queue tabs (HR only for HR and Admin); "New ticket" through Ask amax; four tiles (open, solved by agent, first response vs target, satisfaction); "Tickets per week" (agent vs people) and "Tickets by category" with screen-reader tables; the queue table (ticket, requester, category, priority, SLA left, handled by) and the Facilities empty state. Every tile, chart, row and ticket is pinned; no forms; email text is shown as plain text (AC-1, AC-3)
  Files: modules/helpdesk/ui/*.tsx, modules/helpdesk/ui/helpdesk.css, modules/helpdesk/server/views.ts, modules/helpdesk/module.ts, modules/helpdesk/tests/e2e/*
- [x] `T2` — Contracts first, then the `helpdesk` schema (queue with separate response and resolution SLAs per priority, ticket with channel and source link, ticket event, rating, access resource) with RLS and HR-only visibility. Read tools and pins; audited write tools (`create_ticket`, `assign_ticket`, `resolve_ticket`, `set_queue_sla`, `rate_ticket`, `set_access_resource`); the chat intent `helpdesk.new-ticket`. Fictional fixtures give the mock's numbers (AC-1, AC-2, AC-3)
  Files: modules/helpdesk/contracts.ts, modules/helpdesk/db/migrations/0001_helpdesk.sql, modules/helpdesk/server/*.ts, modules/helpdesk/mcp.ts, modules/helpdesk/pins.ts, modules/helpdesk/chat.ts, modules/helpdesk/fixtures/*, modules/helpdesk/tests/db.ts, modules/helpdesk/tests/installed.ts, modules/helpdesk/tests/contracts.test.ts, modules/helpdesk/tests/tickets.test.ts
- [x] `T3` — The support agent, triaging in 006's untrusted-input mode (the ticket text is quoted data, and `propose_suggestion` is the only tool):
  - It sets category and priority.
  - For an access request it proposes the `helpdesk.access` suggestion, approved only by the resource's owner, and only when the requester is signed in (chat or Teams, never email). On approval the ticket is resolved by the agent and `helpdesk.access.approved` is emitted.
  - It never acts on password, MFA or credential requests; those go to IT as "Needs identity verification".
  - Tests: an injected instruction, an email access request, and a password reset (AC-2)
  Files: modules/helpdesk/server/triage.ts, modules/helpdesk/suggestions.ts, modules/helpdesk/tests/agent.test.ts
  Depends: T2
- [x] `T4` — Integrations, each optional:
  - When onboarding (013) is installed, a joiner's `onboarding.checklist.started` opens a Hardware ticket ("Laptop for new joiner").
  - Requester names come from hr (011) through its contract, falling back to the user's name.
  - 025's ticket route lights up once `helpdesk.ticket` exists. The route test proves it.
  - Each degrades when the other module isn't installed (AC-1, AC-4)
  Files: modules/helpdesk/server/handlers.ts, modules/helpdesk/tests/integrations.test.ts
  Depends: T2
- [x] `T5` — Module standard: README, package.json, a CODEOWNERS line, retention entries (tickets and events seven years after closing, ratings with their ticket), and switch-off. With helpdesk installed, the Operations "Coming soon" entry for Helpdesk goes away, as 021's did. BACKLOG gets "021 grants access when helpdesk approves it" (AC-4)
  Files: modules/helpdesk/README.md, modules/helpdesk/package.json, modules/helpdesk/tsconfig.json, modules/helpdesk/css.d.ts, .github/CODEOWNERS, modules/helpdesk/tests/standard.test.ts, pnpm-lock.yaml, BACKLOG.md
  Depends: T3, T4

## Verify
