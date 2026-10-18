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

- [x] `T1` — API and webhooks screen at /settings/api: credentials, webhooks and rate limits, read-only with pins and Ask amax chips; hub card on (AC-6, AC-2, AC-3, AC-4, AC-5)
  Files: apps/web/app/(app)/settings/api/page.tsx, apps/web/app/(app)/settings/api/ApiTickets.tsx, apps/web/app/(app)/settings/api/Tables.tsx, apps/web/app/(app)/settings/api/Art.tsx, apps/web/app/(app)/settings/api/format.ts, apps/web/app/(app)/settings/api/api.css, apps/web/lib/admin/status.ts, apps/web/tests/admin/no-forms.test.ts
- [x] `T2` — Migration 0025 (api schema) and service-principal credentials: create, rotate and revoke as confirm-gated MCP tools, per-module read/write/sensitive scopes, expiry of at most a year, acts-for list, key stored hashed and revealed once on the confirm card only; OAuth client credentials grant (AC-2)
  Files: packages/db/migrations/0025_api.sql, packages/auth/src/principals.ts, packages/auth/src/index.ts, packages/api/package.json, packages/api/src/credentials.ts, packages/api/src/client-credentials.ts, packages/api/src/stats.ts, apps/web/lib/admin/api.ts, apps/web/lib/admin/index.ts, apps/web/app/actions/chat.ts, apps/web/lib/chat-outcome.ts, apps/web/components/chat/Chat.tsx, apps/web/components/chat/RevealOnce.tsx, apps/web/app/oauth/token/route.ts, docs/architecture.md
  Depends: T1
- [x] `T3` — REST API generated from the tool registry with an OpenAPI 3.1 document; same permissions, audit and trace as MCP; principals act for a listed person (AC-1)
  Files: packages/api/src/rest.ts, packages/api/src/openapi.ts, packages/api/src/auth.ts, apps/web/app/api/v1/[...path]/route.ts, packages/auth/src/gate.ts
  Depends: T2
- [x] `T4` — Incoming webhook verify helper: GitHub and Azure DevOps signatures, Microsoft Graph clientState, per-tenant secrets from 031, 5-minute replay window, event-ID dedupe, rejections counted (AC-3)
  Files: packages/api/src/verify.ts, packages/core/src/secrets/connectors.ts
  Depends: T2
- [x] `T5` — Outgoing webhooks: subscribe and unsubscribe tools, masked payloads, HMAC-SHA256 with timestamp, delivery as a 029 workflow with backoff, switched off after repeated failures (AC-4)
  Files: packages/api/src/webhooks.ts, packages/api/src/deliver.ts, packages/api/src/module.ts, apps/web/lib/server.ts
  Depends: T2
- [x] `T6` — Rate limits per token, user and tenant across pages, REST and MCP, 429 with Retry-After, limited requests recorded for the screen (AC-5)
  Files: packages/core/src/rate-limit.ts, packages/core/src/server.ts, packages/mcp/src/registry.ts, packages/mcp/src/server.ts, apps/web/proxy.ts, apps/web/lib/rate-limit.ts
  Depends: T3
- [x] `T7` — Tests: key never in model input, chat history, ai.call, trace, audit or logs; REST and OpenAPI; signature formats; outgoing signing, retry and switch-off; MCP flood leaves another tenant unaffected; e2e screen within 2% of the mock, Admin only, axe light and dark (AC-1 to AC-6)
  Files: packages/api/tests/*.test.ts, packages/core/tests/rate-limit.test.ts, apps/web/tests/admin/api-reveal.test.ts, apps/web/tests/e2e/api.spec.ts, apps/web/tests/e2e/api-seed.ts, apps/web/tests/e2e/global-auth.ts, apps/web/playwright.auth.config.ts
  Depends: T1, T2, T3, T4, T5, T6

## Verify

**Verdict:** PASS
- AC-1: pass — `packages/api/tests/ac1-rest.test.ts` (OpenAPI 3.1 doc from the registry; REST call audited as the person with source api and traced as mcp_call then tool_call; 401/400/403 paths); e2e `api.spec.ts` serves /api/v1/openapi.json and refuses a keyless call.
- AC-2: pass — `ac1-rest.test.ts` AC2 (module scopes, acts-for list, expiry capped at 365 days, hash stored, client-credentials token works and can't mint more, refusals audited); `apps/web/tests/admin/api-reveal.test.ts` (key absent from the model's input, chat.conversation, ai.call, core.trace_event, core.audit_event, every other table and console logs; MCP create refused); e2e `api.spec.ts` (key shown once on the card, gone after reload, not in page HTML).
- AC-3: pass — `packages/api/tests/ac3-incoming.test.ts` (GitHub sha256, Azure DevOps basic auth + createdDate window, Graph clientState, amax-signed stale; per-tenant 031 secrets, event-ID dedupe, rejections counted in api.inbound, secret not in the audit).
- AC-4: pass — `packages/api/tests/ac4-outgoing.test.ts` (classified fields masked, HMAC-SHA256 with timestamp verifies, 5 attempts with backoff via the 029 Postgres engine, switched off after 5 failed deliveries, no delivery after).
- AC-5: pass — `packages/api/tests/ac5-rate-limits.test.ts` (MCP flood from one tenant gets 429 with Retry-After, the other tenant's call succeeds; REST 429; page limit per user; limited requests recorded per channel).
- AC-6: pass — e2e `api-visual.spec.ts`: the four tickets each within 2% of the mock at 1440 px, axe clean in light and dark; `api.spec.ts` and `admin.spec.ts`: non-Admin gets 404, no forms, every card/ticket/row pinned.

Commands:
- `npx vitest run --config vitest.config.ts` (DATABASE_MIGRATE_URL set): exit 0, 106 files, 725 passed, 6 skipped
- `pnpm lint` (tsc in every package + check:graph): exit 0; `node scripts/check-module-standard.mjs`: exit 0
- `pnpm build`: exit 0
- `npx playwright test --config playwright.auth.config.ts` (E2E_DB=amax_e2e_035, E2E_AUTH_PORT=3535): exit 0, 51 passed
- `npx playwright test` (guest, E2E_PORT=3536): exit 0, 1 passed
- `specclaw-preset-check .`: exit 1 on 717 pre-existing repo-wide violations; none in the files this change adds
- Quality: not_run (specclaw-quality-scan fails with jq "Argument list too long", a known tool issue)
- specclaw-review: not run (operator: review once per module, at the end)

Screenshots: `.specclaw/changes/035-api-webhooks-and-rate-limits/shots/app.png`, `.specclaw/changes/035-api-webhooks-and-rate-limits/shots/mock.png`
