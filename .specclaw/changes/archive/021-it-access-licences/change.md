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

- [x] `T1` — Access and licences screen, as in the mock: the lede, "Start access review" and "Add licence" through Ask amax, the four tiles (licence spend, unused seats, devices compliant, leavers with access), the Licences table with its total row, spend by product, the licence agent's savings with Review, Devices, and People and access with its read-only filter and Review/Extend through Ask amax. Every tile, row, card and list item is pinned; there are no forms; IT Admin sees no prices (AC-2, AC-4)
  Files: modules/it-access/ui/*.tsx, modules/it-access/ui/it-access.css, modules/it-access/module.ts, modules/it-access/tests/e2e/it-access.spec.ts
- [x] `T2` — Contracts first, then the `it_access` schema (product, account, seat, device, change, sync run, write consent), the read tools and pins, the access-review and extend services, and fixtures from fixtures.md (AC-4)
  Files: modules/it-access/contracts.ts, modules/it-access/db/migrations/0001_it_access.sql, modules/it-access/server/*.ts, modules/it-access/mcp.ts, modules/it-access/pins.ts, modules/it-access/fixtures/, modules/it-access/tests/db.ts, modules/it-access/tests/installed.ts, modules/it-access/tests/contracts.test.ts
- [x] `T3` — Sync under the read-only registration: source adapters for Microsoft Graph (Entra, licences, Intune), Azure DevOps and GitHub, each opening only its 031 read credential (`msgraph-read`, `azure-devops`, `github`), run as a 029 workflow on a schedule. Approved changes use `msgraph-write` only when the tenant has consented, with named scopes; consent is off by default and Admin only (AC-1)
  Files: modules/it-access/sources.ts, modules/it-access/server/sync.ts, modules/it-access/server/apply.ts, modules/it-access/server/consent.ts, modules/it-access/workflows.ts, modules/it-access/tests/sync.test.ts
  Depends: T2
- [x] `T4` — Grant, revoke and remove seats are 006 suggestion kinds (sensitive, with undo) that only `it-access:change:approve` (IT Admin, Admin) can accept. The licence agent proposes removing seats unused 60+ days after each sync; a person asks for a grant or revoke through chat. An accepted change is queued for the apply workflow, and undo cancels it or queues the inverse (AC-2)
  Files: modules/it-access/suggestions.ts, modules/it-access/server/changes.ts, modules/it-access/tests/changes.test.ts
  Depends: T3
- [x] `T5` — `hr.person.left` proposes revoking all of the person's access on their last day; when onboarding is installed, `onboarding.access.requested` makes the same grant or revoke suggestion, deduplicated (AC-3)
  Files: modules/it-access/server/leavers.ts, modules/it-access/tests/leavers.test.ts
  Depends: T4
- [x] `T6` — Module standard: README, manifest, CODEOWNERS line, contract tests, retention entries, can be switched off and runs without onboarding (AC-4)
  Files: modules/it-access/README.md, modules/it-access/package.json, .github/CODEOWNERS, modules/it-access/tests/standard.test.ts
  Depends: T5

## Verify

**Verdict:** PASS

- AC-1: pass. Sync reads Microsoft Graph (Entra, licences, Intune), Azure DevOps and GitHub with read credentials only. Approved changes use `msgraph-write`, only after an Admin consents with named scopes, and it is off by default. Both credentials are 031 secrets. Test: `tests/sync.test.ts` ("AC1 sync opens only read credentials…").
- AC-2: pass.
  - Grant, revoke and remove seat are licence-agent suggestions through 006, approved by IT, with undo while queued or manual.
  - A change left to IT by hand stays pending until a person confirms it (`confirm_access_change`).
  - IT Admin sees seats and use but no prices.
  - Tests: `tests/changes.test.ts`, module e2e.
- AC-3: pass — `hr.person.left` proposes revoking everything on the last day, once, alongside onboarding's own handler. Test: `tests/leavers.test.ts`.
- AC-4: pass — contracts and contract tests, README, fixtures, manifest, retention per 032 and a CODEOWNERS line. The module can be switched off; someone without it-access gets a 404. Tests: `tests/contracts.test.ts`, `tests/standard.test.ts`, module e2e.

Mock: `shots/app.png` (`/it-access` as Maya, Admin) matches `shots/mock.png`: the lede with "Start access review" and "Add licence", four tiles, Licences, Spend by product, Licence savings, Devices and People and access.
- The tiles have no illustrations.
- The licence table has no Export.
- The spend legend shows amounts where the mock shows percentages.
- Devices compliant reads 96.5% from fixtures, where the mock shows 96.4%.

Commands (re-run after merging origin/main at 939a894, with 027 and 025; Postgres 16 at `DATABASE_MIGRATE_URL`, HEAD 1dfffdc):
- `pnpm turbo run lint --force` → 0 (31/31)
- `pnpm turbo run test --force --continue --concurrency=2` → 0 (31/31)
- `pnpm --filter @amax/web build` → 0
- `playwright test --config playwright.auth.config.ts` (apps/web) → 81/81
- module e2e `pnpm --filter @amax/it-access e2e` → 3/3
- `specclaw-preset-check .` → 1: the repo-wide comment and line-length convention, the same exception as earlier changes.
- `specclaw-quality-scan . --gate` → not_run (jq "Argument list too long"); jscpd was run directly, see below.

Ripple: `apps/web/components/marketing/areas.ts` moves Access and licences out of the marketing page's "Coming" claims, because 062's test requires a Coming claim to have no installed module.

Screenshots: `.specclaw/changes/021-it-access-licences/shots/app.png`, `.specclaw/changes/021-it-access-licences/shots/mock.png`.
Review: skipped. Per-change review is off (`code_review: false`, product owner 2026-10-17).

Quality: 0 → 0 duplicated lines (jscpd over modules/it-access; specclaw-quality-scan fails on this repo with jq "Argument list too long", so jscpd was run directly).

Ripple: `modules/onboarding/tests/access.test.ts` asserted that nothing handles `onboarding.access.requested` ("021 isn't installed"); it now expects exactly `it-access.onboarding` when it-access is installed, and still that nothing is revoked.

Review fix (before verify): a change left to IT by hand (`manual`) no longer changes amax's records, because a leaver could show "revoked" while their account was still live. It stays pending: the screen leads with "Waiting for IT" (pinned, with "Confirm done" through Ask amax), and a leaver past their last day counts in "Leavers with access". The new `confirm_access_change` (a `defineService`, `it-access:change:approve`, people only, `manual` changes only) records "Made by hand, confirmed by …", makes the change in the records, and emits `it-access.change.applied`. A sync doesn't confirm a change automatically. Undo cancels a change while it is queued or manual. Test: `tests/changes.test.ts` ("a revoke left to IT by hand changes nothing until a person confirms it").

Ripple: `apps/web/lib/operations.ts`'s "Coming soon" slug for Access and licences was `access`; it is now `it-access`, so the installed module replaces it in the rail (as compliance's does) instead of showing both. The web e2e (`admin.spec.ts` 055 AC4) caught the duplicate.

Commands after the fix: `pnpm turbo run lint --force` → 0 (28/28); `pnpm turbo run test --force --continue --concurrency=2` → 0 (28/28); `pnpm --filter @amax/web build` → 0; module e2e → 3/3; `playwright test --config playwright.auth.config.ts` (apps/web) → 80/80 on the last run. Two earlier runs each had an unrelated failure: `auth.spec.ts` AC5 (sign-out redirect; passes 24/24 alone with `--repeat-each=4`), and chat History's Escape.

