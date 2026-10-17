# Data core: tenancy, money, audit, events, jobs, fixtures

**Change:** 003-data-core · **Created:** 2026-10-17
**Lane:** Platform · **Module:** `packages/core, packages/db, packages/testing` · **Depends on:** [001](../001-amax-foundation/change.md)

## Problem

Modules need one way to write data so every path is permission-checked, audited and able to notify other modules. They also need tenancy, legal entities and money built in from the start. This change is that pipeline plus the single fixtures source the review asked for.

## Mock Delta

No screen of its own; this change is infrastructure used by others.

## Acceptance Criteria

1. **AC-1** Postgres is reached through Drizzle with the `postgres` driver. Each module owns a Postgres schema and its own migrations folder. `pnpm db:migrate` runs core first, then modules in dependency order. Two modules adding migrations in parallel never conflict.
2. **AC-2** Core tables: `core.tenant`, `core.legal_entity` (country, base currency), `core.audit_event`, `core.event` (outbox) and `core.job`. Every module table carries `tenant_id`; entity-owned tables carry `legal_entity_id`; money is stored as `numeric` plus a currency code. Postgres row-level security on `tenant_id` is enabled for every table, keyed on a per-transaction `app.tenant_id` setting, and a test in `@amax/testing` proves one tenant can never read or write another's rows, even through a raw query.
3. **AC-3** `defineService()` runs authorize → validate (zod) → write in a transaction → audit (actor, on-behalf-of, source, before and after) → emit event. Audit, outbox and the write commit in one transaction. Sensitivity-classed fields are stored in the audit as field name plus a keyed hash, never the value. A test shows a write from a server action, from MCP and from a job all produce the same audit shape.
4. **AC-4** `runDueJobs()` runs scheduled jobs and delivers outbox events to module handlers, at least once. Ticks take a lease with `FOR UPDATE SKIP LOCKED`, so overlapping ticks never run the same job twice, and handlers are idempotent on event ID (a test delivers every event twice). It is exposed as `/api/jobs/tick` (Vercel Cron, Cloudflare Cron Trigger) and as a `worker` command (a k3s Deployment). Both are tested.
5. **AC-5** File storage goes through an S3-compatible adapter (S3, R2, MinIO). The only other host-specific code is the cache adapter.
6. **AC-6** `@amax/testing` loads fixtures from each module's `fixtures/`, using the shared people and projects from `fixtures.md` (Lumen Labs). A test checks the cross-module totals listed in fixtures.md once those modules exist.
7. **AC-7** `core.audit_event` is append-only for the app role (insert only) and hash-chained per tenant, so any edit or deletion breaks the chain. The chain is exported daily to object storage with write-once retention.

## Tasks

Assumptions (stated per Rule 1):
- Postgres for tests is real Postgres 16 (RLS can't be proven on an in-process stand-in). Locally `deploy/dev/compose.yaml` (Podman or Docker); in CI a `postgres:16` service. DB tests skip when `DATABASE_URL` is unset, except under `CI=true` where a missing URL fails the run.
- Two roles: the owner (runs migrations, `DATABASE_MIGRATE_URL`) and `amax_app` (the app, `DATABASE_URL`), which owns nothing and has no `BYPASSRLS`. RLS is `ENABLE` + `FORCE`.
- `authorize` in `defineService()` calls a pluggable authorizer; 003 ships allow-all-in-tests and deny-by-default otherwise, and 002 registers `can()`.
- The job runner reads across tenants only through two `SECURITY DEFINER` claim functions; each claimed job or event then runs under its own tenant.
- The k3s `worker` command calls the web app's `/api/jobs/tick` every minute, so the standalone image needs no second entrypoint bundle.
- The app keeps booting without a database (`/healthz` stays green), so the existing deploy targets and the live site are unaffected until a DB is configured.

- [x] `T1` — `@amax/db`: Drizzle + `postgres` client from validated env (`DATABASE_URL`, `DATABASE_MIGRATE_URL`), `withTenant(tenantId, fn)` (transaction + `set_config('app.tenant_id', …, true)`), and the migration runner: core's `packages/db/migrations/*.sql` first, then each module's `db/migrations/*.sql` in manifest dependency order, tracked per (scope, file) with a checksum so parallel modules never collide; `pnpm db:migrate`; local compose file; CI Postgres service (AC-1)
  Kind: impl
  Files: packages/db/src/{client,tenant,migrate}.ts, packages/db/src/index.ts, packages/db/bin/migrate.ts, packages/db/package.json, packages/core/src/env.ts, package.json, deploy/dev/compose.yaml, .github/workflows/ci.yml, packages/db/tests/migrate.test.ts
- [x] `T2` — Core schema and tenancy: migration creating `core.tenant`, `core.legal_entity` (country, base currency), `core.audit_event`, `core.event`, `core.job`, `core.processed_event`, the `amax_app` grants and `core.enable_tenant_rls(regclass)` helper; Drizzle schema plus a `money()` column pair (`numeric(19,4)` + `char(3)`) and `Money` helpers; leak test (tenant B can't read or write tenant A's rows, raw SQL included) and a catalog test that every table with `tenant_id` has RLS enabled and forced (AC-2)
  Kind: migration
  Files: packages/db/migrations/0001_core.sql, packages/core/src/{schema,money}.ts, packages/testing/src/{db,rls}.ts, packages/testing/tests/ac2-rls.test.ts, packages/core/tests/money.test.ts
  Depends: T1
- [x] `T3` — `defineService()` and the audit chain: authorize → zod validate → write in a transaction → audit (actor, on-behalf-of, source, before/after; classified fields stored as field name + HMAC) → outbox event, all committed together; `core.audit_event` insert-only for `amax_app` plus an update/delete-blocking trigger, hash-chained per tenant under an advisory lock, and `verifyAuditChain()`; test that a server action, an MCP handler and a job write the same audit shape, and that editing a row breaks the chain (AC-3, AC-7)
  Kind: impl
  Files: packages/core/src/{service,audit,authorize}.ts, packages/db/migrations/0002_audit_chain.sql, packages/core/tests/ac3-service.test.ts, packages/core/tests/ac7-chain.test.ts
  Depends: T2
- [x] `T4` — Jobs and outbox: `runDueJobs(registry)` leases due jobs and undelivered events via `FOR UPDATE SKIP LOCKED` claim functions, runs module handlers under each row's tenant, retries with backoff, reschedules cron jobs; `onceForEvent()` idempotency helper; manifest types for `jobs` and `events.handles`; `/api/jobs/tick` (bearer `CRON_SECRET`), a Vercel cron entry, a Cloudflare Cron Trigger worker wrapper, a `worker` command and a Helm worker Deployment; tests for overlapping ticks, double delivery, the tick route and the worker loop (AC-4)
  Kind: impl
  Files: packages/core/src/jobs.ts, packages/core/src/module.ts, packages/db/migrations/0003_claims.sql, apps/web/app/api/jobs/tick/route.ts, apps/web/vercel.json, apps/web/wrangler.jsonc, apps/web/worker.ts, apps/web/scripts/worker.mjs, deploy/helm/amax/templates/worker.yaml, deploy/helm/amax/values.yaml, packages/core/tests/ac4-jobs.test.ts, apps/web/tests/tick.test.ts
  Depends: T3
- [x] `T5` — Host adapters and audit export: S3-compatible storage (fetch + SigV4 via `aws4fetch`, so it runs on Node and Workers) with put/get/delete/presign and write-once put (object-lock mode + retain-until); cache adapter interface with a memory implementation; the daily `core.audit.export` job writing each tenant's chain as NDJSON with write-once retention; a test that no package or module outside the adapters touches host-specific APIs (AC-5, AC-7)
  Kind: impl
  Files: packages/core/src/adapters/{storage,cache}.ts, packages/core/src/audit-export.ts, packages/core/tests/ac5-adapters.test.ts, packages/core/tests/ac7-export.test.ts
  Depends: T4
- [x] `T6` — Fixtures: `@amax/testing` seeds the shared Lumen Labs tenant, entities, people and projects from fixtures.md, then each installed module's `fixtures/`; a totals table from fixtures.md whose checks run once their modules exist (today: headcount 184 = 171 + 13, the people and project lists) (AC-6)
  Kind: test
  Files: packages/testing/src/fixtures/{shared,load,totals}.ts, packages/testing/tests/ac6-fixtures.test.ts
  Depends: T2

## Verify

**Verdict:** PASS
- AC-1: pass — `packages/db/tests/migrate.test.ts`: core first then modules in dependsOn order (cycles rejected); per-(scope, file) checksummed records let two modules both ship `0001_init.sql`; an edited applied file fails; a failing file rolls back. `pnpm db:migrate` applies 0001–0003.
- AC-2: pass — `packages/testing/tests/ac2-rls.test.ts`: every table with `tenant_id` (and `core.tenant`) has RLS enabled, forced and a policy (`tablesMissingRls()`); `amax_app` owns nothing and has no BYPASSRLS; tenant B reads 0 of A's rows even with a raw `where tenant_id = A`, can't insert, update or delete them; no tenant set means no rows. Money: `packages/core/tests/money.test.ts` (exact BigInt arithmetic, currency mismatch refused).
- AC-3: pass — `packages/core/tests/ac3-service.test.ts`: server action, MCP and job contexts produce identical audit columns and before/after fields; classified `bankAccount` stored as `{ $class, $hmac }`, raw value absent; write, audit and outbox commit together (failing run leaves none); forbidden before validation, validation before write.
- AC-4: pass — `packages/core/tests/ac4-jobs.test.ts`: three overlapping ticks run 10 jobs exactly once each, each under its own tenant; keyed jobs dedupe; failures back off and record the error; cron rows per tenant reschedule; every event delivered twice changes nothing the second time. `apps/web/tests/tick.test.ts`: tick route auth (401/503/200), the Cloudflare cron request, and the worker loop. Smoke: container image ticked against Postgres (event delivered, 401 without secret, `worker.mjs` polling); `wrangler deploy --dry-run` bundles `worker.ts` with the cron trigger; `helm template --set worker.enabled=true` renders the worker.
- AC-5: pass — `packages/core/tests/ac5-adapters.test.ts`: SigV4-signed S3 requests, object-lock headers + Content-MD5, presign, lock refusal mapping, memory storage retention, cache TTL; a scan keeps host-specific imports (`@vercel/`, `cloudflare:`, `@aws-sdk/`, Redis, …) inside `packages/core/src/adapters/` and `fs` out of request-path code. Manually verified against a MinIO bucket created with object lock (locked put, get, presigned GET).
- AC-6: pass — `packages/testing/tests/ac6-fixtures.test.ts`: shared Lumen Labs fixtures match fixtures.md (people, projects, entities); totals (headcount 184, departments 184, contract $774,000, invoiced $418,200, Maya's team 5) pass, module-dependent totals wait as pending; `loadFixtures()` seeds as the app role, then modules in dependency order, and re-runs cleanly.
- AC-7: pass — `packages/core/tests/ac7-chain.test.ts`: insert-only for the app role, trigger blocks update/delete/truncate for the owner too, concurrent writers keep one chain, an edit or deletion made by disabling the trigger is caught at that row. `packages/core/tests/ac7-export.test.ts`: daily NDJSON export with a verified-chain trailer, locked ~7 years, can't be overwritten.

Commands (all exit 0, with `DATABASE_MIGRATE_URL` set): `pnpm test` (57 tests), `pnpm lint`, `pnpm build`, `pnpm --filter @amax/web e2e`, `pnpm --filter @amax/web build:cloudflare`, `node scripts/check-graph.mjs`, `node scripts/check-module-standard.mjs`, `helm lint deploy/helm/amax`. (`specclaw-preset-check` / `specclaw-quality-scan` aren't in the specclaw 0.6.7 installed on the vps.)

Notes for dependants:
- 002 registers `can()` with `setAuthorizer()`; until then services deny by default.
- Server code imports `@amax/core/server`; `@amax/core` stays client-safe.
- Modules call `select core.enable_tenant_rls('<schema>.<table>')` for each table and `tablesMissingRls()` in their tests.
