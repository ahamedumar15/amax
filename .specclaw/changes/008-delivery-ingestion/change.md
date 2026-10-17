# Delivery: specclaw and git ingestion

**Change:** 008-delivery-ingestion · **Created:** 2026-10-17
**Lane:** Delivery · **Module:** `modules/delivery (ingestion)` · **Depends on:** [007](../007-delivery-projects/change.md), [006](../006-agent-governance/change.md), [029](../029-workflows-scheduler/change.md), [009](../009-time-and-approvals/change.md), [035](../035-api-webhooks-and-rate-limits/change.md)

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

## Tasks

## Verify
