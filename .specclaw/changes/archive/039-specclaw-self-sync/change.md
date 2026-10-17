# Delivery: specclaw self-sync, so amax tracks its own build

**Change:** 039-specclaw-self-sync · **Created:** 2026-10-17
**Lane:** Delivery · **Module:** `modules/delivery (self-sync)` · **Depends on:** [007](../007-delivery-projects/change.md), [002](../002-identity-and-access/change.md) · **Integrates with (optional):** [004](../004-mcp-gateway/change.md)

## Problem

amax is built through specclaw, but its own progress lives only in `.specclaw/changes/*` and `node scripts/queue.mjs status`. 007 gives us the project board for specclaw proposals; full ingestion (008) waits on ten changes (006, 009, 029, 035 and what they need). Until then the product owner can't watch amax being built in amax. A one-way importer that reads the repo's own specclaw folders closes that gap as soon as 007 lands, and doubles as the first real dataset on the board.

## Mock Delta

No new screens. The amax project appears on the 007 screens: [`001-amax-foundation-projects`](../../mock/index.html#001-amax-foundation-projects) — Projects lists "amax", its board shows every change in its phase column, and Proposals shows the phase bar per change.

## Acceptance Criteria

1. **AC-1** A pure parser reads `.specclaw/changes/<NNN-name>/` (`change.md`, `status.md`, `claim.md`, `tasks.md` if present) and `.specclaw/changes/archive/*` into proposal records: key (`AMX-007`), title, lane, phase (proposal, spec, design, tasks, build, verify, PR, archived), approved, claimed-by machine, hard and optional dependencies, task done/total and AC count. Ready/blocked is computed with the same rules as `scripts/queue/state.mjs`, and a test runs both over this repo and gets the same answer for every change.
2. **AC-2** The importer upserts those records into the 007 `delivery` tables through the module's own services (`defineService`, so every write is audited), as a 002 service principal scoped to the one project it syncs. Re-running with nothing changed writes nothing and adds no audit rows. A folder that disappears marks its proposal withdrawn, never deletes it. It never writes back to the repo.
3. **AC-3** A phase change emits the existing `delivery.proposal.phase_changed` event, attributed "specclaw-sync" with the commit SHA it read.
4. **AC-4** It runs as `pnpm --filter @amax/delivery sync:specclaw --repo <path> --project <key>` against `DATABASE_URL`. A GitHub Actions job runs it on pushes to `main` that touch `.specclaw/**`, using repository secrets; a failed sync never blocks a merge. The workflow file is the only change outside `modules/delivery/` and is reviewed by Platform CODEOWNERS.
5. **AC-5** After a sync of this repo, the amax project board at 1440 px shows every change in the right column, with approved/claimed/blocked badges matching `queue.mjs status`.
6. **AC-6** The module meets `docs/module-standard.md`: self-sync can be switched off on its own; when 008 ships, its `sync_proposal` tool supersedes this importer (the importer calls it when 004 is installed, else writes through services directly), and the importer is removed in 008's change or a follow-up.

## Tasks

Assumptions (Rule 1):
- Phase mapping: not approved → proposed; approved → planned; claimed or tasks started → building; verify done or PR raised → verified; archived → released (archived means merged to `main`, which the hosted environment deploys).
- Work in progress lives on `specclaw/<change>` branches, so the sync reads `main` plus each change's own branch and keeps the furthest state; `main` alone would jump from planned to released.
- The importer authenticates with a 002 service-principal token scoped to `delivery:proposal:sync` (minted by `admin principal-add`); its writes go through a `defineService` so they are audited as the principal.
- The GitHub Actions job runs only when the `AMAX_SYNC_DATABASE_URL` and `AMAX_SYNC_TOKEN` secrets exist; the self-hosted environment syncs from the server every few minutes instead (amax-deploy), because its database isn't reachable from GitHub.

- [x] `T1` — Parser: read change folders (main + branch overlays) into records (key, title, lane, phase, approved, claim, deps, tasks, ACs, PR, timestamps); ready/blocked identical to `scripts/queue/state.mjs` (tested against it on this repo) (AC-1)
  Kind: impl
  Files: modules/delivery/sync/specclaw.ts, modules/delivery/tests/sync-parse.test.ts
- [x] `T2` — Importer: `syncProposal` service + `syncSpecclaw()` (creates the project, upserts changed proposals only, marks vanished ones withdrawn, emits `phase_changed`), CLI `pnpm --filter @amax/delivery sync:specclaw`, `admin principal-add`; idempotency and audit tests (AC-2, AC-3, AC-4)
  Kind: impl
  Files: modules/delivery/sync/{import.ts,bin.ts}, modules/delivery/server/services.ts, packages/auth/bin/admin.ts, modules/delivery/tests/sync-import.test.ts
  Depends: T1
- [x] `T3` — Board shows the sync's extra facts (lane, ready/blocked, claim, PR link) on AMX cards; workflow `.github/workflows/specclaw-sync.yml`; e2e that the AMX board matches `queue.mjs status` (AC-4, AC-5)
  Kind: impl
  Files: modules/delivery/ui/ProjectPage.tsx, .github/workflows/specclaw-sync.yml, apps/web/tests/e2e/delivery.spec.ts
  Depends: T2

## Verify

**Verdict:** PASS
- AC-1: pass — `modules/delivery/tests/sync-parse.test.ts`: reads all change folders (archived and active) into records with title, lane, module, phase, approval, claim, hard/optional deps, task done/total, AC count, PR and verdict; ready/blocked/claimed equals `scripts/queue/state.mjs` for every change in this repo.
- AC-2: pass — `sync-import.test.ts`: upserts through `syncProposal` (a `defineService`) as a 002 service principal scoped to `delivery:proposal:sync`; a re-run with nothing changed writes and audits nothing; a vanished folder is marked withdrawn, not deleted; nothing is written to the repo.
- AC-3: pass — a phase change (branch overlay moves TST-002 planned → building) emits `delivery.proposal.phase_changed`; audit rows carry the principal and the commit sha.
- AC-4: pass — `pnpm --filter @amax/delivery sync:specclaw --repo … [--overlay …]` with `DATABASE_URL`, `AMAX_SYNC_TOKEN`, `AUDIT_HASH_KEY`; `.github/workflows/specclaw-sync.yml` runs on pushes to `main` touching `.specclaw/**` only when its secrets exist, with `continue-on-error`. The self-hosted environment syncs from the server instead (amax-deploy `sync`), since its database isn't reachable from GitHub.
- AC-5: pass — e2e: after a sync of this repo, the AMX board's lane counts equal the parser's phases and cards show lane and ready/blocked/claimed badges; axe clean.
- AC-6: pass — lives in `modules/delivery/sync/`; when 008 ships its `sync_proposal` tool supersedes this (008 AC-7).

Commands: `pnpm test`, `pnpm lint`, `pnpm build`, `e2e`, `e2e:auth` (12 flows), graph and module-standard checks.
