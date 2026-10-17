# Public API, signed webhooks and rate limits

**Change:** 035-api-webhooks-and-rate-limits · **Created:** 2026-10-17
**Lane:** Platform · **Module:** `packages/api` · **Depends on:** [002](../002-identity-and-access/change.md), [003](../003-data-core/change.md), [031](../031-secrets-and-keys/change.md)

## Problem

The roadmap promises a REST API and webhooks, CI tools post into amax, and MCP clients call tools at machine speed. Nothing verifies incoming webhooks, scopes machine credentials, or limits request rates, so commits can be forged and one client can starve a tenant (architecture review F2, F5, F19).

## Mock Delta

What changes on screen, and where to see it: [`035-api-webhooks-and-rate-limits`](../../mock/index.html#035-api-webhooks-and-rate-limits)

New admin screen, API and webhooks: service credentials with owner, scopes, expiry and the people they may act for; incoming and outgoing webhooks with verification status; and requests limited this week.

## Acceptance Criteria

1. **AC-1** A REST API is generated from the same module services (OpenAPI 3.1), with the same permissions and audit as pages and MCP.
2. **AC-2** Service principals (002) authenticate with API keys or OAuth client credentials. Each has explicit scopes (read, write or sensitive, per module), an owner, an expiry of at most one year, and a list of people it may act for. Keys are stored hashed and shown once.
3. **AC-3** Incoming webhooks (Azure DevOps, GitHub, Microsoft Graph) are verified with the provider's signature or a per-tenant secret (031), within a 5-minute replay window and with event-ID dedupe. Unverified requests are rejected and counted. 008 uses this helper.
4. **AC-4** Tenants can subscribe to events through outgoing webhooks. Payloads respect masking, are signed with HMAC-SHA256 and a timestamp, are retried by 029 with backoff, and are switched off after repeated failures.
5. **AC-5** Rate limits apply per token, user and tenant across pages, REST and MCP, and return 429 with Retry-After. A test floods MCP from one tenant and shows another tenant unaffected.
6. **AC-6** The API and webhooks screen matches the mock within a 2% visual diff and is visible to Admin only.

## Tasks

## Verify
