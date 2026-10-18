# Release and region hardening

**Change:** 044-release-and-region-hardening · **Created:** 2026-10-17
**Lane:** Delivery · Platform · **Module:** `modules/delivery`, `packages/ai` · **Depends on:** [042](../042-release-management/change.md), [033](../033-ai-gateway/change.md)

## Problem

The final review of 042 raised three design questions the product owner deferred here on 2026-10-17 (option 1), so #25 could ship with its concrete bugs fixed:

1. Voiding the Prod deployment that released a release sets its proposals to "verified", whatever phase they had before. That phase isn't recorded, so a mistaken deployment can't be undone exactly.
2. A proposal synced from specclaw has two writers for its phase: the sync (from the repo) and Prod deployments and moves (MCP and chat). The next sync silently reverts the other writer's change and emits a backwards phase_changed.
3. "AI runs in AU" is an Admin's declaration. Nothing makes the provider client call an endpoint in that region, so the data-region gate can pass while calls go elsewhere.

## Acceptance Criteria

1. **AC-1** Each proposal's phase before release is recorded with the releasing deployment, and voiding it restores exactly that phase, with phase_changed events that match.
2. **AC-2** One owner for a synced proposal's phase: Prod deployments and moves either refuse specclaw rows or the sync keeps a Released set by a Prod deployment. The choice is documented, and a test covers sync after release.
3. **AC-3** The AI provider's endpoint and region come from configuration that the gate checks. An unknown or mismatched endpoint region blocks AI under a data region.

## Source

042 final review (`.specclaw/changes/042-release-management/review/round-12.json`), findings on `modules/delivery/server/services.ts` and `packages/ai/src/policy.ts`.

## Tasks

Choice for AC-2 (documented in `modules/delivery/README.md`): each phase has one owner. The repo owns a
synced proposal's phase up to Verified, so a board move of a specclaw row is refused. Prod deployments own
Released, so a sync never moves a Released row back; it may set Released itself for an archived change.
Voiding the Prod deployment restores the recorded phase (AC-1), and the next sync then follows the repo again.

- [x] `T1` — AI settings screen shows the configured provider endpoint and its region beside the data-region gate (AC-3)
  Files: apps/web/app/(app)/settings/ai/page.tsx, apps/web/lib/admin/status.ts
- [x] `T2` — Provider endpoint and region from configuration; the gate blocks AI under a data region when the endpoint region is unknown or differs (AC-3)
  Files: packages/core/src/env.ts, packages/ai/src/anthropic.ts, packages/ai/src/gateway.ts, packages/ai/src/policy.ts, apps/web/lib/server.ts, packages/ai/tests/region-044.test.ts
  Depends: T1
- [x] `T3` — A releasing deployment records each proposal's prior phase; voiding it restores exactly that phase with matching phase_changed events (AC-1)
  Files: modules/delivery/db/migrations/0013_release_prior_phase.sql, modules/delivery/server/services.ts, modules/delivery/tests/releases.test.ts
- [ ] `T4` — One owner per phase for synced proposals: board moves refuse specclaw rows, the sync never reverts a Released set by a Prod deployment, documented and tested (AC-2)
  Files: modules/delivery/server/services.ts, modules/delivery/README.md, modules/delivery/tests/sync-import.test.ts
  Depends: T3

## Verify
