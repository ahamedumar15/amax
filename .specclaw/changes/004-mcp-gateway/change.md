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

## Verify
