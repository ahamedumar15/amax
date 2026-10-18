# Keyflow sister-product sync

**Change:** 028-keyflow-sync · **Created:** 2026-10-17
**Lane:** Integrations · **Module:** `modules/keyflow` · **Depends on:** [011](../011-hr-core/change.md), [029](../029-workflows-scheduler/change.md), [031](../031-secrets-and-keys/change.md)

## Problem

OKRs, feedback and recognition stay in Keyflow; amax syncs people out and goals and scores in.

## Mock Delta

What changes on screen, and where to see it: [`001-amax-foundation-integrations`](../../mock/index.html#001-amax-foundation-integrations)

The Keyflow sister-product card.

## Acceptance Criteria

1. **AC-1** Two-way sync: people and teams out; goals, review scores and recognition in, shown on the person page. Review scores are `sensitive: 'performance'`.
2. **AC-2** Sync status and errors on Integrations. Runs as a job.
3. **AC-3** The module meets `docs/module-standard.md`: it changes nothing outside `modules/<name>/` (apart from its CODEOWNERS line); its `contracts.ts` is published first and has contract tests; it has a README, fixtures and a manifest; it can be switched off; and every optional integration degrades gracefully when the other module isn't installed.

## Tasks

- [x] `T1` — Mock: add this change's own sections, the Keyflow sync screen (connection, last sync, what went out and came in, sync errors with Ask amax, recent runs) and a person's Keyflow performance page (goals, review scores masked by `performance`, recognition); a pin on every card, ticket and row (AC-1, AC-2)
  Files: .specclaw/mock/index.html
- [x] `T2` — Publish `contracts.ts`: goal, review score, recognition and sync-run types, event names and payloads (`keyflow.sync.completed`, `keyflow.sync.failed`), `keyflowProfile(tx, reader, personId)` (scores masked per `performance`) and `lastSync(tx, reader)` reads, with contract tests (AC-1, AC-3)
  Files: modules/keyflow/contracts.ts, modules/keyflow/package.json, modules/keyflow/tsconfig.json, modules/keyflow/css.d.ts, modules/keyflow/.gitignore, modules/keyflow/tests/contracts.test.ts, pnpm-lock.yaml
- [x] `T3` — Screens matching the mock: the Keyflow sync screen at /keyflow (Operations, linked from Settings and Integrations by breadcrumb) leading with errors, and the person's Performance page mounted at /hr/p/:employeeNo/performance (051); Ask amax buttons and pins everywhere, no forms (AC-1, AC-2)
  Files: modules/keyflow/ui/*.tsx, modules/keyflow/ui/keyflow.css
  Depends: T2
- [x] `T4` — `keyflow` schema (connection, sync run, sync error, outbound link, goal, review score, recognition; RLS on tenant_id), fixtures consistent with the shared Lumen Labs people and clearly fictional, and the sandbox Keyflow the demo tenant syncs with (AC-1, AC-2)
  Files: modules/keyflow/db/migrations/0001_keyflow.sql, modules/keyflow/fixtures/index.ts, modules/keyflow/server/sandbox.ts
  Depends: T2
- [x] `T5` — Sync: the transport (HTTPS through the `@amax/api/egress` guards, the `keyflow` credential through `@amax/core/secrets`), people and teams out as deltas, goals, scores and recognition in, recorded by a `defineService()` with its run, counts and per-record errors; the `keyflow.sync` workflow on a 15-minute cron (029); services to set the endpoint and dismiss an error; MCP read and write tools (AC-1, AC-2)
  Files: modules/keyflow/server/*.ts, modules/keyflow/workflows.ts, modules/keyflow/mcp.ts
  Depends: T4
- [x] `T6` — Manifest (group Operations, grants, retention for every personal table, events and payloads, workflow and schedule, mounted route), chat intent "connect Keyflow", README, CODEOWNERS line (AC-2, AC-3)
  Files: modules/keyflow/module.ts, modules/keyflow/chat.ts, modules/keyflow/README.md, .github/CODEOWNERS
  Depends: T5
- [ ] `T7` — Tests: schema, RLS and retention; sync with a fake transport (deltas, unmatched people, Keyflow errors, unreachable host, missing credential); egress refuses private hosts; performance masking; chat-first (writes wait for confirm, pins resolve); module standard (switch-off, only hr installed); screen a11y e2e (AC-1..AC-3)
  Files: modules/keyflow/tests/*.ts, modules/keyflow/tests/e2e/*
  Depends: T6

## Verify
