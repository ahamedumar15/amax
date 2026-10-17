# Workflows and scheduler: durable runs for agents and jobs

**Change:** 029-workflows-scheduler · **Created:** 2026-10-17
**Lane:** Platform · **Module:** `packages/workflows` · **Depends on:** [003](../003-data-core/change.md)

## Problem

Agent tasks run long: scanning an inbox, preparing a payroll check, waiting days for a person to approve, then acting. Recurring work (risk scans, licence sweeps, reminders) needs cron. 003's simple job tick can't resume a half-finished run after a restart or a deploy, and wiring Temporal straight into modules would tie amax to hosts that can run long-lived workers.

Modules need one durable-workflow API whose engine changes per host: built-in Postgres everywhere, and Temporal on k3s or Temporal Cloud when runs get heavy.

## Mock Delta

What changes on screen, and where to see it: [`026-insights`](../../mock/index.html#001-amax-foundation-insights)

"Recurring agent work" on Insights becomes the scheduler view: each job's schedule, last and next run, status, and on/off switch. An admin "Runs" list (planned for 029's build) shows each run's steps, waits and retries.

## Acceptance Criteria

1. **AC-1** `@amax/workflows` exposes `defineWorkflow`, `step` (retried, result checkpointed), `sleep`, `waitForEvent` (for example, a suggestion accepted or rejected) and `cron`. Modules register workflows and schedules in their manifest and never import an engine directly.
2. **AC-2** The default engine stores runs, steps and timers in Postgres (`workflows` schema). It is driven by the 003 tick (`/api/jobs/tick` on Vercel Cron and Cloudflare Cron Triggers, or the `worker` Deployment on k3s). A test kills the worker mid-run and shows the run resuming from the last completed step, with no step repeated.
3. **AC-3** A Temporal adapter runs the same workflow definitions on Temporal (self-hosted on k3s through its Helm chart, or Temporal Cloud), with workers in the `worker` Deployment. Config selects the engine per deployment, and the same test suite passes on both engines.
4. **AC-4** Steps that call LLMs or external APIs have timeouts, retry policies and an idempotency key. A run that waits for a person has no execution time limit (it can wait days), and it costs nothing while waiting.
5. **AC-5** Every run records its inputs, steps, tool calls, outputs, cost and the person it acts for. Admins can pause, resume, cancel or retry a run, and each of those actions is audited.
6. **AC-6** Cron schedules support time zones per legal entity (Asia/Colombo, Australia/Sydney) and can be switched on and off on Insights. A disabled schedule creates no runs.
