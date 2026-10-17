# IT: access, licences and devices

**Change:** 021-it-access-licences · **Created:** 2026-10-17
**Lane:** IT · **Module:** `modules/it-access` · **Depends on:** [011](../011-hr-core/change.md), [006](../006-agent-governance/change.md), [031](../031-secrets-and-keys/change.md) · **Integrates with (optional):** [013](../013-onboarding-offboarding/change.md)

## Problem

One view of what each person can use: Entra groups, Microsoft 365 and SaaS seats, Azure DevOps and GitHub, cloud roles and Intune devices, plus licence spend.

## Mock Delta

What changes on screen, and where to see it: [`001-amax-foundation-access`](../../mock/index.html#001-amax-foundation-access)

Access and licences: inventory, spend, savings (Review → Approve removal), devices, people and access.

## Acceptance Criteria

1. **AC-1** Sync from Microsoft Graph (Entra, licences, Intune), Azure DevOps and GitHub runs under a read-only app registration. Approved changes use a separate write registration with named scopes, consented per tenant and off by default. Both credentials live in 031.
2. **AC-2** Licence and access changes (grant, revoke, remove seat) are agent suggestions approved by IT, with undo, through 006.
3. **AC-3** Reacts to `hr.person.left` by proposing revocation on the last day.
4. **AC-4** The module meets `docs/module-standard.md`: it changes nothing outside `modules/<name>/` (apart from its CODEOWNERS line); its `contracts.ts` is published first and has contract tests; it has a README, fixtures and a manifest; it can be switched off; and every optional integration degrades gracefully when the other module isn't installed.

## Tasks

## Verify
