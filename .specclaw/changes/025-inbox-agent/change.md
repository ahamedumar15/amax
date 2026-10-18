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
- [x] `T4` — Triage in 006's untrusted-input mode (the excerpt only as quoted data, no write tool offered): each find becomes a 006 suggestion that links to its message and is routed to the module that owns the record type (Presales, Leave, Helpdesk) through its chat intent; a record type whose module isn't installed is never suggested. An injected instruction in a message is a test (AC-2, AC-5)
  Files: modules/inbox-agent/routes.ts, modules/inbox-agent/server/triage.ts, modules/inbox-agent/suggestions.ts, modules/inbox-agent/tests/triage.test.ts
  Depends: T3
- [x] `T5` — Module standard: README, package.json, CODEOWNERS line, retention (excerpts deleted 30 days after the find closes or expires, 032), can be switched off with and without each owning module installed (AC-4, AC-5)
  Files: modules/inbox-agent/README.md, modules/inbox-agent/package.json, .github/CODEOWNERS, modules/inbox-agent/tests/standard.test.ts
  Depends: T4

## Verify

**Verdict:** PASS

- AC-1: pass.
  - The scan reads nothing until an Admin records Entra admin consent (`record_inbox_consent`). After that it reads only the allow-listed mailboxes and channels (`allow_inbox_source`, `remove_inbox_source`), each from the moment it was allowed.
  - Anything Graph returns for another source, or from before the source was allowed, is dropped. Only managers change the list.
  - Test: `tests/scan.test.ts` ("AC1 reads nothing without consent…").
- AC-2: pass.
  - Each find is a 006 suggestion that shows its source and links to the message.
  - "Add" opens the owning module's chat intent (Presales, Leave; Helpdesk stays dark until 022). A record type whose module isn't installed is never offered.
  - Tests: `tests/triage.test.ts`, `tests/standard.test.ts`, module e2e.
- AC-3: pass, with a gap.
  - The scan is the hourly 029 schedule "Teams and email scan", switchable under Settings, Workflows and on the Suggestions screen.
  - **Gap:** "switchable on Insights" is 026's screen, which isn't built yet (BACKLOG: "Insights 'Recurring agent work' switch").
  - Test: `tests/scan.test.ts` ("AC3 the scan is an hourly 029 schedule…").
- AC-4: pass — contracts and contract tests, README, fixtures, manifest and a CODEOWNERS line. The module can be switched off, and with presales and leave switched off their record types are never offered or shown. Tests: `tests/contracts.test.ts`, `tests/standard.test.ts`.
- AC-5: pass.
  - Only a plain-text excerpt (at most 280 characters) and a safe link are stored, deleted 30 days after the find closes or expires (032).
  - Messages reach the model in 006's untrusted-input mode, as quoted data, with no tool but `propose_suggestion`. An injected instruction is a test.
  - Graph uses the 031 `msgraph-read` credential through the 035 egress guards. A missing credential fails the scan without showing a secret.
  - Tests: `tests/scan.test.ts`, `tests/triage.test.ts`, `tests/standard.test.ts`.

Outside the module: `.github/CODEOWNERS`, `pnpm-lock.yaml` and `BACKLOG.md`, which gets five follow-ups: close a find when its record is added, a Presales log-activity intent, Helpdesk's intent names, the Graph read credential label, and the Insights switch.

Mock: 025 has no mock section of its own (see Tasks). `/inbox-agent` follows the Presales "Found by agents in Teams and email" strip (`shots/mock.png`, `001-amax-foundation-presales`): the same card with source, excerpt, Add, Open in chat and Dismiss. The tiles, allow-list and scans tables reuse the app's patterns. `shots/app.png` was re-taken on HEAD after the plural fix ("2 new opportunities").

Commands (re-run after merging origin/main at 3639408, with 027; Postgres 16 at `DATABASE_MIGRATE_URL`, HEAD 16469f5):
- `pnpm turbo run lint --force` → 0 (30/30)
- `pnpm turbo run test --force --continue --concurrency=2` → 0 (30/30)
- `pnpm --filter @amax/web build` → 0
- `playwright test --config playwright.auth.config.ts` (apps/web) → 81/81. The first run failed `auth.spec.ts` AC5's sign-out redirect, the same flake 021 recorded, and stopped there. The re-run passed everything.
- module e2e `pnpm --filter @amax/inbox-agent e2e` → 1/1 (axe, nothing unpinned, no forms, Add opens the owner's intent)
- `specclaw-preset-check .` → 1: the repo-wide comment and line-length convention, the same exception as earlier changes.
- `specclaw-quality-scan . --gate` → not_run (jq "Argument list too long"); jscpd was run directly, see below.

Known limits:
- A find stays open after its record is added, until the person accepts or dismisses the suggestion or it expires in 7 days (BACKLOG).
- Sales activities route to Presales' `log_opportunity_activity` by prompt, because Presales has no activity intent yet.

Screenshots: `.specclaw/changes/025-inbox-agent/shots/app.png` (`/inbox-agent` as Maya, Admin), `.specclaw/changes/025-inbox-agent/shots/mock.png`.
Review: skipped. Per-change review is off (`code_review: false`, product owner 2026-10-17).

Quality: 0 → 0 duplicated lines (jscpd on modules/inbox-agent; specclaw-quality-scan fails on this repo).
