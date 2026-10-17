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

Assumptions (Rule 1):
- Provider: Anthropic's Claude API via `@anthropic-ai/sdk` (the only package allowed to import it). Default model `claude-haiku-5-5`, fallback `claude-sonnet-5-5` (product owner, 2026-10-17), both from env (`AMAX_AI_MODEL`, `AMAX_AI_FALLBACK_MODEL`); the fallback runs when the primary errors, refuses or returns out-of-schema output. Bedrock is a later provider behind the same interface.
- Zero data retention is an organisation setting at the provider; amax records the tenant's requirement, shows it, and keeps AI off when the requirement isn't confirmed by an Admin.
- The gateway also offers a bounded tool loop (`converse`) because chat (005) needs tool calls; tools are zod-typed and run through module services, so the provider SDK stays inside `packages/ai`.
- Untrusted text is wrapped in `<data>` blocks with any closing tags neutralised, and the system prompt says data is never instructions; with no tools offered, an injected instruction has nothing to call, and every output is validated against the caller's zod schema.
- The AI and data screen is an app route (`/settings/ai`) until 038 adds the Settings hub; Admin only.

- [ ] `T1` — `packages/ai`: provider interface, Anthropic provider (structured outputs via `messages.parse` + zod, tool loop), fake provider for tests; `complete`, `extract`, `converse`; model fallback; check-graph rule R7 (no provider SDK outside `packages/ai`) (AC-1, AC-3)
  Kind: impl
  Files: packages/ai/{package.json,tsconfig.json,src/*.ts,tests/*.ts}, scripts/graph/rules.mjs, packages/testing/boundaries/r7-provider-sdk/**, packages/testing/tests/ac3-boundaries.test.ts
- [ ] `T2` — Tenant policy and logging: `ai.settings` (provider, region, ZDR, allowed sensitivity classes, voice, data/db/storage/AI regions) and `ai.call` (tenant, caller, source, model, tokens, cost, redactions — never content); redaction before every call; region gate turns AI off (AC-2, AC-4, AC-5, AC-6)
  Kind: impl
  Files: packages/db/migrations/0006_ai.sql, packages/ai/src/{policy,redact,log}.ts, packages/ai/tests/*.test.ts
  Depends: T1
- [ ] `T3` — AI and data screen (Admin): tickets (region, calls and cost this month, fields redacted, injection attempts), the class policy table, provider and subprocessors cards, matching the mock; e2e + visual check (AC-7)
  Kind: impl
  Files: apps/web/app/(app)/settings/ai/page.tsx, apps/web/tests/e2e/ai.spec.ts
  Depends: T2

## Verify
