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
2. **AC-2** The default engine stores runs, steps and timers in Postgres (`workflows` schema). It is driven by the 003 tick (`/api/jobs/tick` on Vercel Cron and Cloudflare Cron Triggers, or the `worker` Deployment on k3s). A test kills the worker mid-run and shows the run resuming from the last completed step, with no completed step re-run. Steps must be idempotent, because both engines can deliver a step more than once.
3. **AC-3** A Temporal adapter runs the same workflow definitions on Temporal (self-hosted on k3s through its Helm chart, or Temporal Cloud), with workers in the `worker` Deployment. Config selects the engine per deployment, and the same test suite passes on both engines.
4. **AC-4** Steps that call LLMs or external APIs have timeouts, retry policies and an idempotency key. A run that waits for a person has no execution time limit (it can wait days), and it costs nothing while waiting.
5. **AC-5** Every run records its inputs, steps, tool calls, outputs, cost and the person it acts for, masked by sensitivity class and kept according to 032. Admins can pause, resume, cancel or retry a run, and each of those actions is audited.
6. **AC-6** Cron schedules support time zones per legal entity (Asia/Colombo, Australia/Sydney) and can be switched on and off on Insights. A disabled schedule creates no runs.

## Tasks

Assumptions (stated per Rule 1):
- Insights (026) isn't built yet, so the scheduler view and the admin Runs list ship as an Admin screen at `/settings/workflows` (Settings, like AI and data), built from components 026 can embed as its "Recurring agent work" card.
- Both engines share one replay interpreter: a workflow body re-runs from the top, and completed steps, fired timers and received events come back from history instead of running again. Postgres keeps that history in `workflows.*`; Temporal keeps it in workflow state and runs each step as an activity (so module code never enters Temporal's sandbox).
- `waitForEvent` matches by event name plus a JSON subset of the payload (`payload @> match`), so a match survives restarts; workflows list the outbox events they wait for (`waitsFor`) and those are bridged from `core.event`.
- Per-entity schedules take the time zone from the legal entity's country (LK → Asia/Colombo, AU → Australia/Sydney, else UTC).
- The Temporal suite runs when `AMAX_TEMPORAL_TESTS=1` (local dev server via `@temporalio/testing`) or `TEMPORAL_ADDRESS` is set.

- [x] `T1` — Scheduler and Runs screen: `/settings/workflows` (Admin) with the schedules table (job, schedule + time zone, last and next run, last result, on/off switch) and the Runs list (status, workflow, acts for, steps with waits and retries, cost; masked fields; pause/resume/cancel/retry), matching the mock's "Recurring agent work" card; Settings nav link (AC-5, AC-6)
  Files: apps/web/app/(app)/settings/workflows/{page,actions}.tsx, apps/web/app/(app)/settings/settings.css, apps/web/components/shell/Shell.tsx
  Depends: T3, T4
- [x] `T2` — `@amax/workflows` API and replay core: `defineWorkflow`, `step` (retry policy, timeout, idempotency key, tool-call and cost recording), `sleep`, `waitForEvent`, `cron`, durations; manifest `workflows` and `schedules` fields (additive, opaque in core); registry from manifests; unit tests (AC-1, AC-4)
  Files: packages/workflows/{package.json,tsconfig.json,README.md}, packages/workflows/src/{index,types,define,replay,registry,duration}.ts, packages/core/src/module.ts, tsconfig.base.json, vitest.config.ts, packages/workflows/tests/replay.test.ts
- [x] `T3` — Postgres engine: `workflows` schema (run, step, signal, schedule; RLS; claim functions as amax_claimer), leased claims with a fencing token, step checkpoints, timers, waits with buffered signals, retries with backoff, per-entity time-zone cron schedules (disabled = no runs), admin pause/resume/cancel/retry and schedule toggle with audit, masked run views, retention entry and prune job, outbox bridge; driven by `/api/jobs/tick` (AC-2, AC-4, AC-5, AC-6)
  Files: packages/db/migrations/0016_workflows.sql, packages/workflows/src/pg/{engine,schedules,admin}.ts, packages/workflows/src/retention.ts, apps/web/lib/{server,tick}.ts, apps/web/app/api/jobs/tick/route.ts
  Depends: T2
- [x] `T4` — Temporal adapter: generic interpreter workflow, plan/runStep/record activities, client engine (start, signal, pause/resume/cancel/retry), `startTemporalWorker`, config `AMAX_WORKFLOWS_ENGINE=postgres|temporal`, Helm values for the worker and the Temporal chart/Cloud (AC-3)
  Files: packages/workflows/src/temporal/{workflow,activities,engine,worker}.ts, packages/workflows/src/config.ts, deploy/helm/amax/{values.yaml,templates/worker.yaml}
  Depends: T3
- [x] `T5` — Shared engine suite run on both engines (resume, retries, sleep, waitForEvent, admin actions, no step re-run), a kill test that SIGKILLs a worker process mid-run, schedule and time-zone tests, RLS check, tick route; CI runs the Temporal suite (AC-2, AC-3, AC-5, AC-6)
  Files: packages/workflows/tests/{conformance,kill,schedules,admin}.test.ts, packages/workflows/tests/fixtures/*, .github/workflows/ci.yml
  Depends: T3, T4

## Verify

**Verdict:** PASS
- AC-1: pass — `packages/workflows/tests/replay.test.ts`: `defineWorkflow`/`step`/`sleep`/`waitForEvent`/`cron` replay recorded steps and stop at the first unseen timer or event; names, cron fields, zones and the registry (schedule → unknown workflow) are validated; `step()` outside a run throws. Manifests gain opaque `workflows`/`schedules` fields; nothing outside `@amax/workflows` and the host (`apps/web/lib/server.ts`) imports an engine (graph check ok).
- AC-2: pass — `tests/kill.test.ts` SIGKILLs a real worker process (tsx child) in step two: the next worker re-runs only the in-flight step (`one`, `three` once; `two` started twice, completed once). `tests/conformance.test.ts` (Postgres): checkpointed steps, backoff retries, durable sleep, retry after failure re-runs only the failed step. Driven by `/api/jobs/tick` (smoke: real tick fired the platform's `core.audit-check` schedule and completed the run, `{"runs":1,"schedulesFired":1}`).
- AC-3: pass, with open review majors on Temporal edge cases (see Review) — the same `conformance.test.ts` suite runs on Temporal (local dev server via `@temporalio/testing`, `AMAX_TEMPORAL_TESTS=1`, now set in CI): 3/3 pass on both engines. `engineConfig` selects the engine per deployment; Helm passes `workflows.engine` and `TEMPORAL_*` to web and worker pods (`helm lint`, `helm template --set workflows.engine=temporal`).
- AC-4: pass — `replay.test.ts`: step timeouts abort and report retryable, `NonRetryableError` fails at once, `idempotencyKey` is stable across attempts; conformance: a run waits on an event with no time limit (no wake-up, `wake_at` null), wakes on a matching signal only, and a `timeout` resolves to null.
- AC-5: pass — conformance: inputs, steps, tool calls, cost and `actsFor` recorded per run; `tests/admin.test.ts`: classified input/output masked for viewers without the class, pause/resume/cancel/retry audited (`workflows.run.*`), non-admins refused, RLS forced on every `workflows.*` table, other tenants see nothing; `workflowsRetention` (032 entries) plus the daily `workflows.prune` job.
- AC-6: pass — `tests/schedules.test.ts`: one schedule per legal entity, 06:00 in Asia/Colombo (00:30 UTC) and Australia/Sydney; a disabled schedule creates no runs; toggles are audited. `/settings/workflows` renders the switch (e2e `tests/e2e/workflows.spec.ts`: toggle off/on, axe clean, Admin only).

Commands (exit 0 unless noted, `DATABASE_MIGRATE_URL` on a private Postgres): `pnpm lint` (14 tasks + graph check), `AMAX_TEMPORAL_TESTS=1 pnpm test` (all packages; workflows 13 tests), `pnpm --filter @amax/web build`, `node scripts/check-module-standard.mjs`, `E2E_PORT=3529 playwright test --config playwright.auth.config.ts workflows.spec.ts` (2 passed), `helm lint deploy/helm/amax`. `specclaw-preset-check .` exits 1 and `specclaw-quality-scan . --gate` exits 1 on pre-existing findings only (comment rule repo-wide; `delivery/sync/specclaw.ts parse` and `AiSettingsPage` complexity; oauth/delivery duplicates); the new UI files have none.
Quality: 0 → 0 duplicated lines in this change (the shared step upsert was still folded into `writeStep()`).
Screenshots: `.specclaw/changes/029-workflows-scheduler/shots/app.png`, `app-phone.png` (signed in as Admin), `mock.png` (Insights, whose "Recurring agent work" card the scheduler table matches).

Review (specclaw-review, operator-requested, opus rounds): round 1 0/22/6 → fixed (`fix(review-r1)`); round 2 0/10/3 → fixed (`fix(review-r2)`); round 3 escalated 0/10/2 → Postgres items and the unlaunched-run Temporal cases fixed (`fix(review-r3)`); round 4 escalated (exit 4) 0/6/2, all on the Temporal adapter's launch/signal/control delivery: events buffered in the gap after an accepted `start()` whose commit failed, consumed events re-seeded on a retry relaunch, Temporal signals sent inside the buffering transaction (partial delivery on rollback; event locks held across `workflow.start`), and missing race/failure tests for launched-run controls. Loop stopped at the escalation as the review skill requires; no final pass, so `specclaw-review verdict` is not clean. Proposed redesign: route every Temporal interaction (launch, control, event delivery) through one claimed reconcile pass in the tick — commit DB intent first, then bring Temporal to the row's state with a delivery table (`signal_delivery(run_id, signal_id)`), no Temporal calls under DB locks. The Postgres engine (the default on every host) has no open majors. Remaining minors are in `follow-ups.md`.
Post-review commands (exit 0): `pnpm lint`, `AMAX_TEMPORAL_TESTS=1 pnpm test` (workflows 40 tests on both engines), `pnpm --filter @amax/web build`, e2e `workflows.spec.ts` (2 passed, port 3529), `helm lint`, `podman build --target temporal-worker` (runs read-only up to the Temporal connect), Temporal worker entry smoke against a dev server (`core.audit-check` completed via Temporal).

Notes for dependants:
- Insights (026) can embed `SchedulesCard` with `listSchedules()`; modules register `workflows`/`schedules` in their manifest and wait on outbox events by listing them in `waitsFor`.
- The Temporal worker ships as `docker build --target temporal-worker` (tag `<tag>-temporal-worker`), deployed by the chart when `workflows.engine=temporal`. CI doesn't build that target yet.
- Entities other than Sri Lanka need a `workflows.entity_zone` row (no admin screen for it yet) before their per-entity schedules fire.
