# Delivery: createProject contract

**Change:** 045-delivery-create-project-contract · **Created:** 2026-10-17
**Lane:** Delivery · **Module:** `modules/delivery` · **Unblocks:** [020-presales](../020-presales/) (PR #32) "Promote to delivery"

## Problem

Presales' "Promote to delivery" feature-detects `createProject` on `@amax/delivery/contracts` and stays disabled until delivery publishes it. Delivery only has the service internally. Presales also has to guess whether an existing project is "the one we made" (key + name + client), and it can't create the project inside its own transaction. Its follow-ups ask for a contract that takes an external reference or runs in the caller's transaction, plus a published permission name.

## Mock Delta

None. This changes a contract only and nothing on screen. Presales' Promote button becomes enabled through its own change.

## Acceptance Criteria

1. **AC-1** `@amax/delivery/contracts` exports `createProject(ctx, { key, name, client, billing, managerName? })`, returning `{ id, key }`. It makes the same project, environments and audit as the service, so presales' current call works unchanged, including under `withIdempotency` (one counted write, and a replay comes back with the project's id and key).
2. **AC-2** The contract also takes an optional `sourceRef` (`module.record:id`, e.g. `presales.opportunity:OPP0042`), stored on `delivery.project` and unique per tenant. A second create with the same `sourceRef` and key makes nothing new and returns the existing project with `existing: true`, also when two creates race.
3. **AC-3** A taken key, or a `sourceRef` that already made a project under another key, throws `ProjectConflictError` (not retryable, with `existingKey`), also when creates race. Only the contract accepts `sourceRef`: the MCP/UI service drops it.
4. **AC-4** The contract exports `PROJECT_CREATE_PERMISSION` (`delivery:project:create`, the permission the service checks), and contract tests cover every new export: shape, idempotency replay, permission refusal, invalid input, sourceRef replay and race, and conflicts.

Not in scope (review round 1): creating the project inside the caller's transaction. Doing it without a second copy of core's authorize→validate→write→audit pipeline needs core to run a service spec in an existing transaction, which is outside `modules/delivery`. Recorded in follow-ups.md.

## Tasks

- [x] `T1` — Project source reference: migration and in-service replay by sourceRef (AC-2)
  Files: modules/delivery/db/migrations/0011_project_source_ref.sql, modules/delivery/server/project-create.ts, modules/delivery/server/services.ts
- [x] `T2` — Publish createProject, PROJECT_CREATE_PERMISSION and ProjectConflictError on the contract (AC-1, AC-3, AC-4)
  Files: modules/delivery/contracts.ts, modules/delivery/server/project-create.ts, modules/delivery/README.md
  Depends: T1
- [x] `T3` — Contract tests: shape, idempotency key, permission, validation, sourceRef replay and race, conflicts (AC-1–AC-4)
  Files: modules/delivery/tests/create-project-contract.test.ts
  Depends: T2

## Verify

**Verdict:** PASS (gates). Local review OPEN: the operator's 5-round cap was reached, and round 5's one major is fixed but was not re-reviewed (see follow-ups.md).

- AC-1: pass. `tests/create-project-contract.test.ts` "AC-1": presales' call shape `{ key, name, client, billing }` returns `{ id, key }` with Dev/QA/UAT/Prod, makes 1 counted write under `withIdempotency`, and the replay returns `{ id, key, replayed: true }`.
- AC-2: pass. "AC-2": the same sourceRef and key return `existing: true`. Two racing creates make one project, and exactly one of them reports `existing`.
- AC-3: pass. Conflict table (contract, service, registry mcp and chat), the sourceRef format table (including the hyphenated module ids it-access and payroll-lk), and the key race. `tests/create-project-surfaces.test.ts`: `handleMcp` returns a tool error with "project key CON is taken; choose another", a chat confirm fails with kind `failed`, and no `"use server"` file creates projects.
- AC-4: pass. "AC-4": `PROJECT_CREATE_PERMISSION` is in the module's permissions, an Engineer is refused, and bad input gets "invalid input".
- Commands (with `DATABASE_MIGRATE_URL=postgres://amax:amax@127.0.0.1:5440/amax`): `pnpm lint` exit 0 (includes the graph check), `pnpm test` exit 0 (delivery 185 tests), `node scripts/check-module-standard.mjs` ok.
- Preset and quality: `specclaw-preset-check .` exit 1 and `specclaw-quality-scan . --gate` exit 1 are repo-wide, as recorded for 041 (comment rule; the high functions are in `sync/specclaw.ts` and `settings/ai/page.tsx`). In this change's files: only the comment rule, and two test files over 80 lines.
- Quality: 49 → 49 duplicated lines (none in this change's files).
- Screenshots: none. The change is contract-only with no screen or mock section.
- Review: `specclaw-review verdict`: OPEN, 5 rounds, final pass missing (capped by the operator at 5 rounds).
