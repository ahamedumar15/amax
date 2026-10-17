# Delivery: createProject contract

**Change:** 045-delivery-create-project-contract · **Created:** 2026-10-17
**Lane:** Delivery · **Module:** `modules/delivery` · **Unblocks:** [020-presales](../020-presales/) (PR #32) "Promote to delivery"

## Problem

Presales' "Promote to delivery" feature-detects `createProject` on `@amax/delivery/contracts` and stays disabled until delivery publishes it. Delivery only has the service internally. Presales also has to guess whether an existing project is "the one we made" (key + name + client), and it can't create the project inside its own transaction. Its follow-ups ask for a contract that takes an external reference or runs in the caller's transaction, plus a published permission name.

## Mock Delta

None. This changes a contract only and nothing on screen. Presales' Promote button becomes enabled through its own change.

## Acceptance Criteria

1. **AC-1** `@amax/delivery/contracts` exports `createProject(ctx, { key, name, client, billing, managerName? })`, returning `{ id, key }`. It makes the same project, environments and audit as the service, so presales' current call works unchanged, including under `withIdempotency` (one counted write, and a replay comes back with the project's id and key).
2. **AC-2** Optional `sourceRef` (e.g. `presales.opportunity:OPP0042`), stored on `delivery.project` and unique per tenant. A second create with the same `sourceRef` makes nothing new and returns the existing project with `existing: true`, also when two creates race.
3. **AC-3** `createProjectInTx(tx, ctx, input)` creates the project in the caller's tenant transaction, with the same authorization, validation and audit, so the project commits or rolls back with the caller's writes. It refuses a transaction whose tenant isn't `ctx.tenantId`.
4. **AC-4** The contract exports `PROJECT_CREATE_PERMISSION = "delivery:project:create"`, and contract tests cover every new export: shape, permission refusal, invalid input, sourceRef replay and race, and in-transaction rollback.

## Tasks

- [ ] `T1` — Project source reference: migration and in-service replay by sourceRef (AC-2)
  Files: modules/delivery/db/migrations/0011_project_source_ref.sql, modules/delivery/server/project-create.ts, modules/delivery/server/services.ts
- [ ] `T2` — Publish createProject, createProjectInTx and PROJECT_CREATE_PERMISSION on the contract (AC-1, AC-3, AC-4)
  Files: modules/delivery/contracts.ts, modules/delivery/server/project-create.ts, modules/delivery/README.md
  Depends: T1
- [ ] `T3` — Contract tests: shape, idempotency key, permission, validation, sourceRef replay and race, in-transaction rollback and tenant guard (AC-1–AC-4)
  Files: modules/delivery/tests/create-project-contract.test.ts
  Depends: T2

## Verify
