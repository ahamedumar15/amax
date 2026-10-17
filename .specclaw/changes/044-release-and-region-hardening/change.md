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

## Verify
