# Delivery: specclaw and git ingestion

**Change:** 008-delivery-ingestion · **Created:** 2026-10-17
**Lane:** Delivery · **Module:** `modules/delivery (ingestion)` · **Depends on:** [007](../007-delivery-projects/change.md), [006](../006-agent-governance/change.md), [029](../029-workflows-scheduler/change.md), [009](../009-time-and-approvals/change.md), [035](../035-api-webhooks-and-rate-limits/change.md), [004](../004-mcp-gateway/change.md)

## Problem

Agents keep the records: specclaw syncs proposal phases and tasks, commits close tasks and log time, and pipelines record deployments.

## Mock Delta

What changes on screen, and where to see it: [`001-amax-foundation`](../../mock/index.html#001-amax-foundation)

The Overview activity feed and the "Claude for <person>" attribution.

## Acceptance Criteria

1. **AC-1** MCP tools `sync_proposal`, `mark_task_done` and `record_deployment` accept calls from specclaw and CI, authenticated as the person or as a 002 service principal limited to these tools and the people it may act for.
2. **AC-2** An Azure DevOps and GitHub webhook adapter, verified through 035 (signature, replay window, dedupe), maps commit authors to people through GitIdentity. A commit is attributed only when the provider verified its signature or the author email is verified for that GitIdentity; unverified and unmatched authors become a suggestion to link.
3. **AC-3** Time logged from commits is a draft suggestion on the person's timesheet (through the `time` contract), never approved automatically.
4. **AC-4** Each ingested event shows on the Overview feed with agent and person attribution.
5. **AC-5** The module meets `docs/module-standard.md`: it changes nothing outside `modules/<name>/` (apart from its CODEOWNERS line); its `contracts.ts` is published first and has contract tests; it has a README, fixtures and a manifest; it can be switched off; and every optional integration degrades gracefully when the other module isn't installed.
6. **AC-6** Logging time from commits is switched on per legal entity by an Admin, after people are notified. Commit data is used only to draft timesheets, never for performance ratings.
7. **AC-7** `sync_proposal` supersedes the 039 specclaw self-sync importer: proposals 039 imported keep their keys and history, and 039's importer is removed or reduced to a caller of `sync_proposal`.

## Tasks

Approved by the product owner in Discord, 2026-10-18 ("start with 38, then wave 4").

Platform ripples AC-5 can't avoid, each kept to a slot that any module can use:
- `ModuleManifest.activity` (an Overview feed contribution) and `ModuleManifest.inbound` (a verified-webhook handler).
- `/api/webhooks/[provider]`, which runs 035's `receiveWebhook` and then hands the verified event to the modules.
- A principal's optional `tools` allow-list, checked wherever the principal's scope is checked.

- [x] `T1` — Overview "Agent activity" card: each module's `activity` feed, merged newest first, with "Claude for <person>" or "<principal> for <person>" attribution as in the 001 mock. Delivery contributes its ingested events (AC-4)
  Files: packages/core/src/module.ts, apps/web/app/(app)/page.tsx, apps/web/components/overview/ActivityFeed.tsx, modules/delivery/server/activity.ts, modules/delivery/module.ts, apps/web/tests/e2e/overview.spec.ts
- [x] `T2` — Proposal tasks as records: a `delivery.task` table that `sync_proposal` writes. `mark_task_done` closes one and keeps `tasks_done` in step. MCP tools `sync_proposal` and `mark_task_done` sit beside `record_deployment`, each declaring its service (AC-1)
  Files: modules/delivery/db/migrations/0013_tasks_ingest.sql, modules/delivery/server/tasks.ts, modules/delivery/server/services.ts, modules/delivery/mcp.ts, modules/delivery/tests/ingest-ac1.test.ts
- [x] `T3` — A principal may be limited to named tools (`tools` on the credential). REST and job calls refuse any other tool, and acts-for limits still apply (AC-1)
  Files: packages/auth/src/credentials.ts, packages/auth/src/principals.ts, packages/api/src/caller.ts, packages/db/migrations/0031_principal_tools.sql, packages/auth/src/credentials-read.ts, apps/web/lib/admin/api.ts, packages/api/tests/principal-tools.test.ts
- [x] `T4` — Inbound webhooks: the `/api/webhooks/[provider]` route verifies through 035 and dispatches to each module's `inbound`. Delivery maps GitHub and Azure DevOps pushes to people through `auth.git_identity`. A commit is attributed only when it is signature-verified or the author's email is verified. Anyone else becomes a "link this Git identity" suggestion. A "T<n> done" commit closes that task (AC-2)
  Files: packages/core/src/module.ts, apps/web/app/api/webhooks/[tenant]/[provider]/route.ts, packages/auth/src/git-identity.ts, modules/delivery/server/ingest.ts, modules/delivery/suggestions.ts, modules/delivery/tests/ingest-ac2.test.ts
  Depends: T2
- [x] `T5` — Commit time becomes a draft suggestion on the person's timesheet through a new `time` contract command, never approved automatically. An Admin switches it on per legal entity (`set_commit_time_logging`, which also records that people were notified). It is never used for ratings (AC-3, AC-6)
  Files: modules/delivery/contracts.ts, modules/delivery/db/migrations/0016_commit_time.sql, modules/delivery/server/commit-time.ts, modules/delivery/mcp.ts, modules/time/server/log.ts, modules/time/suggestions.ts, modules/time/module.ts, modules/delivery/tests/ingest-ac2.test.ts, modules/time/tests/commit-draft-008.test.ts
  Depends: T4
- [x] `T6` — The 039 importer becomes a caller of `sync_proposal`. Keys and history are kept (AC-7)
  Files: modules/delivery/sync/import.ts, modules/delivery/sync/bin.ts, modules/delivery/tests/sync-import.test.ts
  Depends: T2
- [x] `T7` — Module standard: contracts first with contract tests, README, fixtures and manifest. Switching delivery's ingestion off degrades gracefully, as does running without `time` or `agents` (AC-5)
  Files: modules/delivery/module.ts, modules/delivery/db/migrations/0014_activity.sql, modules/delivery/README.md, modules/delivery/tests/delivery.test.ts
  Depends: T5, T6

## Verify

**Verdict:** PASS

- AC-1: pass — the MCP tools `sync_proposal` and `mark_task_done` (with task records in `delivery.task`) sit beside `record_deployment`. A service credential acting for a person calls them, and a credential can be limited to named tools (`auth.service_principal.tools`, checked in the REST caller with acts-for still applied). Tests: `modules/delivery/tests/ingest-ac1.test.ts`; `packages/api/tests/principal-tools.test.ts` (allowed tool 200; other tool 403 by key and by client-credentials token; person not in acts-for 403; refusals audited).
- AC-2: pass — `/api/webhooks/<tenant>/<provider>` runs 035's `receiveWebhook` (signature, replay window, dedupe) and dispatches to `inbound` handlers. Delivery attributes a commit only when it is provider-verified or its email is the verified email of an `auth.git_identity`. An unknown author with a person's work email becomes one `delivery.git-identity` suggestion. Tests: `ingest-ac2.test.ts` (four commits: verified email → closes T1; unverified email → nothing; unknown author → suggestion, made once; provider-verified → closes T4).
- AC-3: pass — a `Time: 1.5h` trailer emits `delivery.commit.time`. Time's handler creates a `time.commit-draft` suggestion on the person's own timesheet. Accepting it logs agent time in a draft week, and undo removes it; nothing is approved automatically. Tests: `modules/time/tests/commit-draft-008.test.ts`, `ingest-ac2.test.ts` "AC-3, AC-6".
- AC-4: pass — the manifest's `activity` slot feeds the Overview's Agent activity card ("Claude for Nimal", "specclaw", "<credential> for <person>", "Git for <person>"), with every line pinned through `get_activity`. Tests: e2e `overview.spec.ts` (attribution, pins, axe) and `ingest-ac1.test.ts` (a credential for a person).
- AC-5: pass — contracts carry the new events and payload types; the contract shape test is updated. README, fixtures (the mock's three feed lines) and manifest are updated, and retention entries cover `task`, `commit_time` and `activity`. `check-module-standard` and `check-graph` pass. Time reads only `@amax/delivery/contracts`. With delivery off, the route has no handler and the Overview shows no feed. With time off, the commit-time event has no reader.
  - Platform ripples, each a slot any module can use and named in the Tasks preamble: `ModuleManifest.activity` and `ModuleManifest.inbound`, the webhook route, the principal `tools` allow-list, and `@amax/auth/git-identity`. Time also gained the `logEntry` extraction.
- AC-6: pass — `set_commit_time_logging` (Admin, per legal entity) refuses to switch on without `peopleNotified: true` and records `notified_at`. No drafts are made for entities that are off. The README states that commit data only drafts timesheets and is never used for ratings. Test: `ingest-ac2.test.ts` "AC-3, AC-6".
- AC-7: pass — the 039 importer writes through `sync_proposal`'s service with task ids and titles. Keys and history are kept, and a task a commit closed stays closed without making every sync a change. Tests: `sync-import.test.ts` (existing 039 cases plus "008 AC-7").

Commands (worktree, Postgres 16 at `DATABASE_MIGRATE_URL`):
- `pnpm turbo run lint` → 0 (23/23); `check-graph` → 0; `check-module-standard` → 0
- `pnpm turbo run test --continue` → one failing contract-shape test fixed, then `vitest run modules/delivery` → 238/238. The other 21 packages passed in the full run.
- `pnpm --filter @amax/web build` → 0; `playwright test` (shell) → 1/1; `playwright test --config playwright.auth.config.ts` → 79/79
- `specclaw-preset-check .` → 1: the repo-wide comment and line-length convention, the same exception as earlier changes.
- `specclaw-quality-scan . --gate` → not_run: it fails with "jq: Argument list too long" on this repo.

Screenshots: `.specclaw/changes/008-delivery-ingestion/shots/app.png` (the Overview Agent activity card) and `.specclaw/changes/008-delivery-ingestion/shots/mock.png` (`#001-amax-foundation`). Compared: the feed's three lines, attribution colours and detail lines match the mock's Agent activity card. The rest of the mock Overview (stat tiles, hours chart, insights, Waiting on you) is out of scope for 008.
Review: skipped. Per-change review is off (`code_review: false`, product owner 2026-10-17).
