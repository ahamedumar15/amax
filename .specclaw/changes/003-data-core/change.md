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

## Verify
