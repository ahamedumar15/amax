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

## Verify
