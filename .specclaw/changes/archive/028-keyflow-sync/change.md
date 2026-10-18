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
- [x] `T7` — Tests: schema, RLS and retention; sync with a fake transport (deltas, unmatched people, Keyflow errors, unreachable host, missing credential); egress refuses private hosts; performance masking; chat-first (writes wait for confirm, pins resolve); module standard (switch-off, only hr installed); screen a11y e2e (AC-1..AC-3)
  Files: modules/keyflow/tests/*.ts, modules/keyflow/tests/e2e/*
  Depends: T6

## Verify

**Verdict:** PASS

- AC-1: pass — people (active, joining, and leavers once as `left`) and teams (hr departments) go out as deltas, hashed per record in `keyflow.link`; goals, review scores and recognition come in, each record checked as untrusted (`invalid` and `unmatched` errors), and show on the person's Performance page at `/hr/p/:employeeNo/performance` (mounted under hr, 051). Review scores are `performance` (retention class, `PROFILE_SENSITIVE`, tool `sensitive`): HR, Leadership, the person and their manager see them, a PM who isn't the manager gets them masked; contract reads fail closed for a hand-built system context (tests/sync.test.ts AC1, tests/profile.test.ts AC1, e2e AC1).
- AC-2: pass — the `keyflow.sync` workflow (029) on a 15-minute cron runs on the Postgres engine; each run is one audited `defineService` write (`keyflow.sync.record` / `keyflow.sync.fail`) with `keyflow.sync.completed|failed` events (counts only). Keyflow is reached only through `@amax/api/egress` (public https, pinned checked address, no redirects) with the 031 `keyflow` credential via `useSecret`; a Keyflow error, unreachable host or missing key is a failed run with its reason. The `/keyflow` screen (crumbs Settings / Integrations) leads with the open errors, then last sync, what went out and came in, and recent runs; connecting and dismissing are chat write tools behind confirm (tests/sync.test.ts AC2, tests/transport.test.ts AC2, tests/chat-first.test.ts AC2, tests/standard.test.ts AC2, e2e AC2).
- AC-3: pass — only `modules/keyflow/` changed plus its CODEOWNERS line and the lockfile entry (and this change's own mock sections); contracts.ts published first (T2) with contract tests; README, fixtures, manifest; switch-off test, and the module runs with only hr installed (integratesWith is empty, so there is no optional module to degrade without); `node scripts/check-module-standard.mjs` ok, retention for every personal table.

Commands (all exit 0): `pnpm turbo run lint --force` + `node scripts/check-graph.mjs` (ok, 7 modules); `pnpm turbo run test --concurrency=1 --force` (19 tasks; keyflow 10/10, web 141, leave 13, hr 57); `node scripts/check-module-standard.mjs`; `pnpm build`; `env -u DATABASE_URL -u DATABASE_MIGRATE_URL pnpm --filter @amax/web e2e` (1 passed); `pnpm --filter @amax/web e2e:auth` (69 passed; after merging origin/main with 006 and 030, 73 passed, and tests, build and both keyflow e2e green again); `pnpm --filter @amax/keyflow e2e` (2 passed: fixtures numbers, pins on every card/ticket/row/list item, axe WCAG 2.2 AA light and dark, no form or dialog, 390 px with no page scroll, the Ask amax prompt carries the error id).

Preset check: exit 1 repo-wide on pre-existing convention (1058 violations); in the new files only the comment rule (65 doc comments, matching the repo's comment style). No line-limit violations in new files.
Quality: not_run (specclaw-quality-scan: "Argument list too long").
Review: not run here (the operator runs specclaw-review once per module end).

Screenshots: `.specclaw/changes/028-keyflow-sync/shots/app.png` (Keyflow screen, signed in as Ravi, IT Admin) and `shots/app-person.png` (Kasun Dias's Performance page, as Maya), from the keyflow e2e; `shots/mock.png` and `shots/mock-person.png` (this change's mock sections `#028-keyflow-sync` and `#028-keyflow-person`, rendered on their own because of the mock's known unclosed-section bug). Compared: same layout, tickets, errors table, runs and cards; the mock's numbers were settled to what the fixtures produce (3 errors, 184 people, 8 teams, 11 goals, 5 scores, 6 recognitions).
