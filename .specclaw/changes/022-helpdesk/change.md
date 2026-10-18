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

**Verdict:** PASS

- AC-1: pass.
  - Tickets come from chat, Teams and email, each with its channel and a safe source link. Email and Teams arrive through 025's ticket route, which is now live (`modules/inbox-agent/tests/triage.test.ts` expects the ticket).
  - Each queue (IT, HR, Facilities) has separate response and resolution SLAs per priority, and SLA left is computed at read time.
  - A joiner's checklist opens a Hardware ticket when onboarding is installed.
  - Tests: `tests/tickets.test.ts`, `tests/integrations.test.ts`, module e2e.
- AC-2: pass, with two notes.
  - The support agent triages in 006's untrusted-input mode. It acts only through the `helpdesk.access` suggestion, which only the resource's owner can approve, and only for a signed-in requester (chat or Teams).
  - An injected instruction, an email access request and a password or MFA request each get no action. Credential requests land in IT as "Needs identity verification".
  - On approval the ticket resolves as the support agent's, and `helpdesk.access.approved` is emitted.
  - HR tickets and the HR queue are visible only to HR and Admin. IT Admin never sees an HR ticket.
  - **Note:** HR-only is enforced by the `helpdesk:queue:hr` permission in every read and service, not by row-level security, which only isolates tenants.
  - **Note:** Admin holds every permission, so Admin can also approve an access suggestion. IT Admin, the requester and other employees are refused.
  - Tests: `tests/agent.test.ts`, `tests/tickets.test.ts`, module e2e.
- AC-3: pass — the chat intent `helpdesk.new-ticket` fills `create_ticket`, and "New ticket" opens chat. Tests: `tests/tickets.test.ts`, module e2e.
- AC-4: pass — contracts and contract tests, README, fixtures, manifest, retention (tickets seven years after closing) and a CODEOWNERS line. The module can be switched off, and it still loads without hr or onboarding. Tests: `tests/contracts.test.ts`, `tests/standard.test.ts`, `tests/integrations.test.ts`.

Ripples outside the module:
- `modules/inbox-agent/tests/triage.test.ts`: with `helpdesk.ticket` installed, the injection test's valid proposal is now the ticket.
- `apps/web/tests/e2e/admin.spec.ts`: the "Coming soon" check now uses Digital experience (037), since Helpdesk has a real screen.
- `apps/web/components/marketing/areas.ts`: Helpdesk moves from coming to live.
- `BACKLOG.md`: adds "021 grants access when helpdesk approves it", and drops 025's "Helpdesk's ticket intent and permission", because the names match.

Mock: `shots/app.png` (`/helpdesk` as Maya, Admin) matches `shots/mock.png` region by region: the lede, queue tabs and New ticket, four tiles, Tickets per week, Tickets by category and the IT queue. Differences:
- The lede says "mostly access requests", not "and password resets" (AC-2).
- The tiles have no illustrations.
- Requesters show full names.
- The queue's Filter button is left out.

Commands (worktree at origin/main 6fe7791, Postgres 16 at `DATABASE_MIGRATE_URL`, HEAD 4387f02):
- `pnpm turbo run lint --force` → 0 (32/32)
- `pnpm turbo run test --force --continue --concurrency=2` → 0 (32/32)
- `pnpm --filter @amax/web build` → 0
- `playwright test --config playwright.auth.config.ts` (apps/web) → 81/81
- module e2e `pnpm --filter @amax/helpdesk e2e` → 3/3 (axe in light and dark, nothing unpinned, no forms, New ticket opens chat, no sideways scroll at 390 px)
- `specclaw-preset-check .` → 1: the repo-wide comment and line-length convention, the same exception as earlier changes.
- `specclaw-quality-scan . --gate` → not_run (jq "Argument list too long"); jscpd was run directly, see below.

Known limits:
- The demo clock is pinned at Oct 16, 10:00 UTC (`helpdesk.clock_pin`), so a ticket raised live in the demo measures its SLA from then.
- Without hr, a joiner's Hardware ticket has no requester.
- The access grant itself waits for 021 (BACKLOG).

Screenshots: `.specclaw/changes/022-helpdesk/shots/app.png`, `.specclaw/changes/022-helpdesk/shots/mock.png`.
Review: skipped. Per-change review is off (`code_review: false`, product owner 2026-10-17).

Quality: 0 → 0 duplicated lines (`npx jscpd modules/helpdesk`: 0 clones in 42 files across 6 formats; `specclaw-quality-scan .` failed with jq "Argument list too long"). No refactor commit: there was nothing to remove.
