# MCP gateway with module tools

**Change:** 004-mcp-gateway · **Created:** 2026-10-17
**Lane:** Platform · **Module:** `packages/mcp` · **Depends on:** [002](../002-identity-and-access/change.md), [003](../003-data-core/change.md) · **Integrates with (optional):** [035](../035-api-webhooks-and-rate-limits/change.md)

## Problem

Agent-native means every capability is an MCP tool with the same permissions as the UI. Modules need one place to register tools without each running a server.

## Mock Delta

What changes on screen, and where to see it: [`001-amax-foundation-integrations`](../../mock/index.html#001-amax-foundation-integrations)

Integrations: the MCP tool catalogue filtered to the tools the viewer's roles can call, the "Add to Claude Code" command, and the connected-apps cards.

## Acceptance Criteria

1. **AC-1** `/api/mcp` serves MCP over Streamable HTTP and authenticates with OAuth tokens issued for the MCP resource (audience-bound, short-lived, revocable), never a reused web session. It provides OAuth protected-resource metadata.
2. **AC-2** Modules register tools in their manifest. Each tool calls a module service, so permission checks and audit come from the pipeline. A test calls the same service through a page action and through MCP and gets the same result and the same audit event, apart from `source`.
3. **AC-3** `whoami` and `search` ship with the gateway. The tool list returned to a caller only includes tools their roles allow. Tools declare a scope (read, write or sensitive) and the read-only and destructive hints; a token without the matching scope can't list or call the tool, and the consent screen shows the scopes asked for.
4. **AC-4** The Integrations screen lists tools by module, with who can use them, generated from the registry.

## Tasks

Assumptions (Rule 1):
- Built on 033's stack (#21) so chat (005) can use the registry as soon as T1 lands; T1 is what 005 needs, T2/T3 complete the external gateway.
- Tool scopes: `read` (no side effects), `write` (changes records), `sensitive` (reads classified data). Hints follow MCP's `readOnlyHint` / `destructiveHint`.
- OAuth: amax is its own authorization server for the MCP resource (OAuth 2.1, authorization code + PKCE, dynamic client registration, RFC 9728 protected-resource metadata). Access tokens are opaque, 1-hour, audience-bound to `/api/mcp`, stored hashed in `auth.api_token` (kind `mcp`) with scopes and client, revocable; refresh tokens rotate. A web session never authenticates MCP.
- Transport: the SDK's web-standard Streamable HTTP transport, stateless per request, so it runs in the Next route on Node, Vercel and Workers.

- [ ] `T1` — Registry: typed `McpToolDef` in the manifest (name, description, zod input, permission, scope, hints, run); `whoami` and `search` built in (modules contribute search results); `toolsFor(viewer, scopes)` lists only tools the roles and token scopes allow; `callTool()` re-checks and runs through module services (source `mcp` or `chat`); delivery's tools move to the typed shape; same-service/same-audit test (AC-2, AC-3)
  Kind: impl
  Files: packages/core/src/module.ts, packages/mcp/src/{registry,builtins}.ts, modules/delivery/{mcp.ts,module.ts}, packages/mcp/tests/registry.test.ts
- [ ] `T2` — `/api/mcp` over Streamable HTTP with OAuth: metadata endpoints, client registration, authorize + consent screen showing scopes, token endpoint (PKCE, refresh, revoke), bearer validation (audience, expiry, revocation); an end-to-end test with the MCP client SDK (AC-1, AC-3)
  Kind: impl
  Files: packages/db/migrations/0007_mcp_oauth.sql, packages/mcp/src/{oauth,server}.ts, apps/web/app/api/mcp/route.ts, apps/web/app/.well-known/*, apps/web/app/oauth/*, packages/mcp/tests/oauth.test.ts
  Depends: T1
- [ ] `T3` — Integrations screen (Admin): tools by module with scope, hints and the roles that can use them, generated from the registry; connected MCP clients with revoke (AC-4)
  Kind: impl
  Files: apps/web/app/(app)/settings/integrations/page.tsx, apps/web/tests/e2e/mcp.spec.ts
  Depends: T2

## Verify
