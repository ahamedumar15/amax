# AI gateway, prompt safety and data residency

**Change:** 033-ai-gateway-and-residency · **Created:** 2026-10-17
**Lane:** Platform · **Module:** `packages/ai` · **Depends on:** [002](../002-identity-and-access/change.md), [003](../003-data-core/change.md)

## Problem

Chat extraction, payroll explanations, the inbox agent and insights all send company data to an LLM provider, and voice input goes to the browser vendor. Nothing decides which provider and region are used, which fields may leave, or how text from outside the company is kept from steering an agent (architecture review F3, F11).

## Mock Delta

What changes on screen, and where to see it: [`033-ai-gateway-and-residency`](../../mock/index.html#033-ai-gateway-and-residency)

New admin screen, AI and data: the tenant's data region, AI provider and region, which data classes may be sent, voice input on or off, the subprocessor list, and this month's usage with redactions applied.

## Acceptance Criteria

1. **AC-1** Every LLM call goes through `@amax/ai` (`complete`, and `extract` with a zod schema). A new check-graph rule fails any module or package that imports a model provider SDK directly.
2. **AC-2** Each tenant sets a provider and region, requires zero data retention from the provider, and chooses which 002 sensitivity classes may be sent. Blocked fields are redacted before the call; a test shows pay and health values never reach the provider when blocked.
3. **AC-3** Untrusted text (email, Teams, tickets, documents, pinned records) is passed as quoted data, never as instructions, and every output is validated against the caller's schema. A fixture set of injection messages produces no tool calls and no out-of-schema output.
4. **AC-4** Each tenant records a data region. When the database, file storage or AI provider is outside it, the AI and data screen shows a blocking warning and AI features stay off until an Admin resolves it.
5. **AC-5** Voice input can be switched off per tenant. When it is on, the chat shows which service processes the audio.
6. **AC-6** Each call records tenant, caller, model, tokens, cost and the redactions applied, but not the content. Content logging is off by default.
7. **AC-7** The AI and data screen matches the mock within a 2% visual diff and is visible to Admin only.

## Tasks

## Verify
