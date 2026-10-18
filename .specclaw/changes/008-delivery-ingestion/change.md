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

- [ ] `T1` — Overview "Agent activity" card: each module's `activity` feed, merged newest first, with "Claude for <person>" or "<principal> for <person>" attribution as in the 001 mock. Delivery contributes its ingested events (AC-4)
  Files: packages/core/src/module.ts, apps/web/app/(app)/page.tsx, apps/web/components/overview/ActivityFeed.tsx, modules/delivery/server/activity.ts, modules/delivery/module.ts, apps/web/tests/e2e/overview.spec.ts
- [ ] `T2` — Proposal tasks as records: a `delivery.task` table that `sync_proposal` writes. `mark_task_done` closes one and keeps `tasks_done` in step. MCP tools `sync_proposal` and `mark_task_done` sit beside `record_deployment`, each declaring its service (AC-1)
  Files: modules/delivery/db/migrations/0013_tasks_ingest.sql, modules/delivery/server/tasks.ts, modules/delivery/server/services.ts, modules/delivery/mcp.ts, modules/delivery/tests/ingest-ac1.test.ts
- [ ] `T3` — A principal may be limited to named tools (`tools` on the credential). REST and job calls refuse any other tool, and acts-for limits still apply (AC-1)
  Files: packages/auth/src/credentials.ts, packages/auth/src/principals.ts, packages/api/src/caller.ts, packages/db/migrations/00xx_principal_tools.sql, packages/api/tests/principal-tools.test.ts
- [ ] `T4` — Inbound webhooks: the `/api/webhooks/[provider]` route verifies through 035 and dispatches to each module's `inbound`. Delivery maps GitHub and Azure DevOps pushes to people through `auth.git_identity`. A commit is attributed only when it is signature-verified or the author's email is verified. Anyone else becomes a "link this Git identity" suggestion. A "T<n> done" commit closes that task (AC-2)
  Files: packages/core/src/module.ts, apps/web/app/api/webhooks/[provider]/route.ts, modules/delivery/server/ingest.ts, modules/delivery/suggestions.ts, modules/delivery/tests/ingest-ac2.test.ts
  Depends: T2
- [ ] `T5` — Commit time becomes a draft suggestion on the person's timesheet through a new `time` contract command, never approved automatically. An Admin switches it on per legal entity (`set_commit_time_logging`, which also records that people were notified). It is never used for ratings (AC-3, AC-6)
  Files: modules/time/contracts.ts, modules/time/suggestions.ts, modules/delivery/server/commit-time.ts, modules/delivery/mcp.ts, modules/delivery/tests/ingest-ac3.test.ts
  Depends: T4
- [ ] `T6` — The 039 importer becomes a caller of `sync_proposal`. Keys and history are kept (AC-7)
  Files: modules/delivery/sync/import.ts, modules/delivery/sync/bin.ts, modules/delivery/tests/sync-import.test.ts
  Depends: T2
- [ ] `T7` — Module standard: contracts first with contract tests, README, fixtures and manifest. Switching delivery's ingestion off degrades gracefully, as does running without `time` or `agents` (AC-5)
  Files: modules/delivery/contracts.ts, modules/delivery/README.md, modules/delivery/fixtures/, modules/delivery/tests/ingest-ac5.test.ts
  Depends: T5, T6

## Verify
