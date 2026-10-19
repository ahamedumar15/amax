# Chat tool schema hotfix

**Change:** 069-chat-tool-schema-hotfix · **Created:** 2026-10-19

## Problem

Hosted chat fails on every message. The Anthropic API rejects the whole request with `400 tools.N.custom.input_schema.type: Field required`, because `place_legal_hold` (a `z.discriminatedUnion`) and `allow_inbox_source` (a union) emit a top-level `oneOf`/`anyOf` JSON schema. The API needs `type: "object"` and refuses a top-level `oneOf`, `anyOf` or `allOf`. One bad tool breaks every chat turn.

## Mock Delta

What changes on screen, and where to see it: [`069-chat-tool-schema-hotfix`](../../mock/index.html#069-chat-tool-schema-hotfix)

Nothing new on screen. Chat answers again where it showed the "AI chat failed" error. The mock section shows a chat turn that succeeds.

## Acceptance Criteria

1. **AC-1** The Anthropic provider sends union tool inputs as a single `type: "object"` schema with no top-level `oneOf`, `anyOf` or `allOf`. Properties from every branch are merged, `required` keeps only the fields every branch requires, and a discriminator becomes an `enum`.
2. **AC-2** A test checks every tool in the web tool registry: its provider schema has `type: "object"` and no top-level `oneOf`, `anyOf` or `allOf`.
3. **AC-3** zod still validates tool input in full. A `place_legal_hold` call whose input matches no branch still fails as an invalid call.
4. **AC-4** A failed model call puts the provider's HTTP status and error type (for example `400 invalid_request_error`) on `AiOutputError.code`, so the content-free server log line shows it. No message text reaches the log.

## Tasks

- [x] `T1` — Flatten union tool inputs into one object schema in the Anthropic provider (AC-1, AC-3)
  Files: packages/ai/src/tool-schema.ts, packages/ai/src/anthropic.ts, packages/ai/tests/tool-schema.test.ts
- [x] `T2` — Every registered tool sends a valid provider schema (AC-2)
  Files: apps/web/tests/tool-schemas.test.ts
  Depends: T1
- [x] `T3` — Carry the provider's status and error type as `AiOutputError.code` (AC-4)
  Files: packages/ai/src/gateway.ts, packages/ai/tests/gateway.test.ts

## Verify
