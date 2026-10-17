# Delivery: specclaw and git ingestion

**Change:** 008-delivery-ingestion · **Created:** 2026-10-17
**Lane:** Delivery · **Module:** `modules/delivery (ingestion)` · **Depends on:** [007](../007-delivery-projects/change.md), [006](../006-agent-governance/change.md), [029](../029-workflows-scheduler/change.md)

## Problem

Agents keep the records: specclaw syncs proposal phases and tasks, commits close tasks and log time, and pipelines record deployments.

## Mock Delta

What changes on screen, and where to see it: [`001-amax-foundation`](../../mock/index.html#001-amax-foundation)

The Overview activity feed and the "Claude for <person>" attribution.

## Acceptance Criteria

1. **AC-1** MCP tools `sync_proposal`, `mark_task_done` and `record_deployment` accept calls from specclaw and CI, authenticated as the person or a service identity acting for them.
2. **AC-2** An Azure DevOps and GitHub webhook adapter maps commit authors to people through GitIdentity. Unmatched authors become a suggestion to link.
3. **AC-3** Time logged from commits is a draft suggestion on the person's timesheet (through the `time` contract), never approved automatically.
4. **AC-4** Each ingested event shows on the Overview feed with agent and person attribution.

## Tasks

## Verify
