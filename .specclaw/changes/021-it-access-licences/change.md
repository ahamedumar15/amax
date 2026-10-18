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

Approved by the product owner in Discord, 2026-10-18 ("start with 38, then wave 4"). The screen is
for IT Admin and Admin. Licence prices are the 055 `pricing` class, so IT Admin sees seats and
counts but not money. The demo figures come from fixtures.md "Access and licences" (spend $14,860 a
month over 12 products, 23 unused seats = $624 a month, savings $1,620 and $3,312 a year, Kasun 4
licences and 1 device). No grant, revoke or seat removal ever runs without a person accepting it.

- [ ] `T1` — Access and licences screen, as in the mock: the lede, "Start access review" and "Add licence" through Ask amax, the four tiles (licence spend, unused seats, devices compliant, leavers with access), the Licences table with its total row, spend by product, the licence agent's savings with Review, Devices, and People and access with its read-only filter and Review/Extend through Ask amax. Every tile, row, card and list item is pinned; there are no forms; IT Admin sees no prices (AC-2, AC-4)
  Files: modules/it-access/ui/*.tsx, modules/it-access/ui/it-access.css, modules/it-access/module.ts, modules/it-access/tests/e2e/it-access.spec.ts
- [ ] `T2` — Contracts first, then the `it_access` schema (product, account, seat, device, change, sync run, write consent), the read tools and pins, the access-review and extend services, and fixtures from fixtures.md (AC-4)
  Files: modules/it-access/contracts.ts, modules/it-access/db/migrations/0001_it_access.sql, modules/it-access/server/*.ts, modules/it-access/mcp.ts, modules/it-access/pins.ts, modules/it-access/fixtures/, modules/it-access/tests/db.ts, modules/it-access/tests/installed.ts, modules/it-access/tests/contracts.test.ts
- [ ] `T3` — Sync under the read-only registration: source adapters for Microsoft Graph (Entra, licences, Intune), Azure DevOps and GitHub, each opening only its 031 read credential (`msgraph-read`, `azure-devops`, `github`), run as a 029 workflow on a schedule. Approved changes use `msgraph-write` only when the tenant has consented, with named scopes; consent is off by default and Admin only (AC-1)
  Files: modules/it-access/sources.ts, modules/it-access/server/sync.ts, modules/it-access/server/apply.ts, modules/it-access/server/consent.ts, modules/it-access/workflows.ts, modules/it-access/tests/sync.test.ts
  Depends: T2
- [ ] `T4` — Grant, revoke and remove seats are 006 suggestion kinds (sensitive, with undo) that only `it-access:change:approve` (IT Admin, Admin) can accept. The licence agent proposes removing seats unused 60+ days after each sync; a person asks for a grant or revoke through chat. An accepted change is queued for the apply workflow, and undo cancels it or queues the inverse (AC-2)
  Files: modules/it-access/suggestions.ts, modules/it-access/server/changes.ts, modules/it-access/tests/changes.test.ts
  Depends: T3
- [ ] `T5` — `hr.person.left` proposes revoking all of the person's access on their last day; when onboarding is installed, `onboarding.access.requested` makes the same grant or revoke suggestion, deduplicated (AC-3)
  Files: modules/it-access/server/leavers.ts, modules/it-access/tests/leavers.test.ts
  Depends: T4
- [ ] `T6` — Module standard: README, manifest, CODEOWNERS line, contract tests, retention entries, can be switched off and runs without onboarding (AC-4)
  Files: modules/it-access/README.md, modules/it-access/package.json, .github/CODEOWNERS, modules/it-access/tests/standard.test.ts
  Depends: T5

## Verify
