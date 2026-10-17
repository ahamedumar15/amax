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

## Verify
