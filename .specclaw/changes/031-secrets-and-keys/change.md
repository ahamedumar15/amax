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

## Verify
