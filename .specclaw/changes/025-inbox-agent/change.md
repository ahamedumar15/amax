# Inbox agent: Teams and email to suggestions

**Change:** 025-inbox-agent · **Created:** 2026-10-17
**Lane:** Intelligence · **Module:** `modules/inbox-agent` · **Depends on:** [006](../006-agent-governance/change.md), [005](../005-amax-chat/change.md), [029](../029-workflows-scheduler/change.md), [031](../031-secrets-and-keys/change.md)

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
5. **AC-5** Only an excerpt and a link to the source message are stored, for 30 days (032). Messages are processed in 006's untrusted-input mode, and Graph credentials live in 031.

## Tasks

Approved by the product owner in Discord, 2026-10-18 ("start with 38, then wave 4"). 025 has no mock
section of its own: the "Found by agents in Teams and email" strip lives in Presales (020), the Insights
"Recurring agent work" row is 026's, and Integrations shows the "Inbox agent" card (4 channels, 6
mailboxes, Running). The rail links every module root, so `/inbox-agent` is a read-only screen built
from those mock patterns. Mail and Teams content is untrusted data: the agent only proposes 006
suggestions, and a person adds the record through the owning module's chat intent.

- [x] `T1` — Inbox agent screen at `/inbox-agent`: a lede that leads with open finds, four tiles (open finds, allowed channels and mailboxes, last scan and the next one, admin consent), "Found by agents in Teams and email" with each find's source and a link to the message, and Add (the owning module's chat intent), Open in chat and Dismiss; the allow-list table and recent scans. Every tile, find, row and scan is pinned; no forms, writes through Ask amax; mail text is shown as plain text, never HTML (AC-1, AC-2, AC-3)
  Files: modules/inbox-agent/ui/*.tsx, modules/inbox-agent/ui/inbox.css, modules/inbox-agent/server/views.ts, modules/inbox-agent/module.ts, modules/inbox-agent/tests/e2e/
- [x] `T2` — Contracts first, then the `inbox_agent` schema (consent, source, scan, find) with RLS; Entra admin consent and the per-tenant allow-list as audited services and chat write tools; the read tools and pins (AC-1, AC-4)
  Files: modules/inbox-agent/contracts.ts, modules/inbox-agent/db/migrations/0001_inbox_agent.sql, modules/inbox-agent/server/admin.ts, modules/inbox-agent/server/context.ts, modules/inbox-agent/mcp.ts, modules/inbox-agent/pins.ts, modules/inbox-agent/chat.ts, modules/inbox-agent/fixtures/, modules/inbox-agent/tests/contracts.test.ts
- [x] `T3` — The hourly scan, a 029 workflow and schedule ("Teams and email scan", switchable): with consent only, it reads only allow-listed mailboxes and channels through Microsoft Graph (the 031 `msgraph-read` credential, 035 egress guards) or the fictional sandbox, and stores only an excerpt and a link per message (AC-1, AC-3, AC-5)
  Files: modules/inbox-agent/workflows.ts, modules/inbox-agent/server/scan.ts, modules/inbox-agent/server/record.ts, modules/inbox-agent/server/reader.ts, modules/inbox-agent/server/graph.ts, modules/inbox-agent/server/wire.ts, modules/inbox-agent/server/sandbox.ts, modules/inbox-agent/server/excerpt.ts, modules/inbox-agent/tests/scan.test.ts
  Depends: T2
- [ ] `T4` — Triage in 006's untrusted-input mode (the excerpt only as quoted data, no write tool offered): each find becomes a 006 suggestion that links to its message and is routed to the module that owns the record type (Presales, Leave, Helpdesk) through its chat intent; a record type whose module isn't installed is never suggested. An injected instruction in a message is a test (AC-2, AC-5)
  Files: modules/inbox-agent/routes.ts, modules/inbox-agent/server/triage.ts, modules/inbox-agent/suggestions.ts, modules/inbox-agent/tests/triage.test.ts
  Depends: T3
- [ ] `T5` — Module standard: README, package.json, CODEOWNERS line, retention (excerpts deleted 30 days after the find closes or expires, 032), can be switched off with and without each owning module installed (AC-4, AC-5)
  Files: modules/inbox-agent/README.md, modules/inbox-agent/package.json, .github/CODEOWNERS, modules/inbox-agent/tests/standard.test.ts
  Depends: T4

## Verify
