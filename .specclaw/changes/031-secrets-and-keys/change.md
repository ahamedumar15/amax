# Secrets and keys for tenant connectors

**Change:** 031-secrets-and-keys · **Created:** 2026-10-17
**Lane:** Platform · **Module:** `packages/core (secrets)` · **Depends on:** [003](../003-data-core/change.md)

## Problem

Connectors need per-tenant credentials (Microsoft Graph, Azure DevOps, GitHub, the STP gateway, Xero, Zoho Sign, Keyflow, Teams), but configuration is environment variables only (001 AC-7). There is nowhere to keep them encrypted, rotate them, or show who used them (architecture review F8).

## Mock Delta

What changes on screen, and where to see it: [`031-secrets-and-keys`](../../mock/index.html#031-secrets-and-keys)

New admin screen, Connections and keys: one row per connector credential with status, last rotation, expiry and last use, plus Rotate and Revoke. Values are write-only and never shown.

## Acceptance Criteria

1. **AC-1** `putSecret` and `useSecret` store tenant credentials with envelope encryption: a data key per tenant, wrapped by a KMS adapter (AWS KMS, Azure Key Vault, or a local key file for k3s and development). Postgres holds ciphertext only; a test reads the table directly and finds no plaintext.
2. **AC-2** A secret value never reaches a page, MCP or chat response, log line, error, audit event or workflow run record. A test uses every connector fixture and then searches logs, audit and runs for the value.
3. **AC-3** Every use is audited with connector, purpose and actor, without the value. Rotation creates a new version, keeps the old one valid for a grace period, then revokes it. Expiry warnings are 030 notification rules.
4. **AC-4** Only Admin can view or change connector credentials; the Connections and keys screen matches the mock within a 2% visual diff.
5. **AC-5** Deployment-wide settings (database URL, KMS access, AI provider key) stay environment variables validated at boot. A tenant credential is never read from the environment, and a test proves it.

## Tasks

- [x] `T1` — Connections and keys screen at `/settings/keys`, Admin only, matching the mock: tickets, credentials table, write-only Add / Rotate / Revoke forms (AC-4)
  Files: apps/web/app/(app)/settings/keys/page.tsx, apps/web/app/(app)/settings/keys/actions.ts, apps/web/app/(app)/settings/keys/keys.css, apps/web/components/shell/ProfileMenu.tsx
- [x] `T2` — Envelope encryption: per-tenant data key wrapped by a KMS adapter (local key file, AWS KMS, Azure Key Vault), `putSecret` / `useSecret`, ciphertext-only tables, KMS settings validated at boot (AC-1, AC-5)
  Files: packages/db/migrations/0016_secrets.sql, packages/core/src/secrets.ts, packages/core/src/secrets/kms.ts, packages/core/src/secrets/crypto.ts, packages/core/src/secrets/store.ts, packages/core/src/secrets/connectors.ts, packages/core/src/env.ts
  Depends: T1
- [x] `T3` — Every use audited (connector, purpose, actor, no value); rotation makes a new version and keeps the old one valid for a grace period, then a job revokes and shreds it; expiry warnings emitted as `secrets.credential.expiring` events for 030 rules (AC-3)
  Files: packages/core/src/secrets/store.ts, packages/core/src/secrets/jobs.ts, apps/web/lib/server.ts
  Depends: T2
- [x] `T4` — Leak-proofing: values only inside a `useSecret` callback as a redacting `Secret`, errors scrubbed, results checked; tests for no plaintext in Postgres, every connector fixture vs logs / audit / events / jobs, rotation and grace, KMS adapters, and no tenant credential from the environment (AC-1, AC-2, AC-3, AC-5)
  Files: packages/core/tests/secrets-ac1-envelope.test.ts, packages/core/tests/secrets-ac2-leaks.test.ts, packages/core/tests/secrets-ac3-rotation.test.ts, packages/core/tests/secrets-kms.test.ts, packages/core/tests/secrets-ac5-env.test.ts
  Depends: T3
- [x] `T5` — e2e: seed the Lumen Labs credentials with a throwaway local key, compare the screen to the mock within 2%, check write-only forms, Admin only, and axe (AC-4)
  Files: apps/web/tests/e2e/secrets.spec.ts, apps/web/tests/e2e/global-auth.ts, apps/web/playwright.auth.config.ts
  Depends: T4

The 038 settings hub does not exist yet, so the breadcrumb's "Settings" is plain text (as on `/settings/ai`) and the screen is reached from the profile menu next to the other settings screens.

## Verify

**Verdict:** PASS

- AC-1: pass — `secrets-ac1-envelope.test.ts` dumps every table as the owner and finds no plaintext (raw, base64, hex); data key stored wrapped (`v1:`), RLS on all three tables. `secrets-kms.test.ts` round-trips local key file, AWS KMS (SigV4, encryption context) and Azure Key Vault (wrapkey/unwrapkey) and refuses keys they didn't wrap.
- AC-2: pass — `secrets-ac2-leaks.test.ts`: all 9 connector fixtures logged, echoed, thrown in errors (raw, base64, URL-encoded) and failed in a job; console, errors, audit, events, job `last_error` and the whole database hold no value. Mutation check: dropping error scrubbing fails it.
- AC-3: pass — `secrets-ac3-rotation.test.ts`: use audited with connector, purpose, actor, versions; rotation keeps v1 valid in grace (`useValidSecrets` returns both), sweep revokes and shreds it; revoke shreds all; one `secrets.credential.expiring` event per threshold.
- AC-4: pass — `secrets.spec.ts` (e2e, amax_e2e_031 on :3531): `.row.head` and tickets 1, 3, 4 within 2% of the mock at 1440px, axe clean; write-only add/rotate/revoke never render the value; Engineer gets no screen.
- AC-5: pass — `secrets-ac5-env.test.ts`: AMAX_KMS companions and ANTHROPIC_API_KEY validated by `loadEnv`; env vars named after every connector are never used; no `process.env` in `packages/core/src/secrets`.

Commands: `pnpm lint` (0, includes check:graph), `pnpm test` with DATABASE_MIGRATE_URL (0; core 53 tests), `pnpm --filter @amax/web build` (0), `E2E_DB=amax_e2e_031 E2E_AUTH_PORT=3531 pnpm exec playwright test --config playwright.auth.config.ts --grep "031|033"` (0).
Preset check / quality gate: exit 1 on the repo as a whole (243 violations and 2 high functions on main, none in this change's new files; this change removed its own comments in shared files).
Screenshots: `.specclaw/changes/031-secrets-and-keys/shots/app.png`, `app-390.png` (no horizontal scroll), `mock.png`.
Local review: run after the PR (operator asked for a capped 5-round loop).

Quality: 37 → 37 duplicated lines (none in this change; the viewer-to-context helper shared by the screen and its actions was extracted by hand)
