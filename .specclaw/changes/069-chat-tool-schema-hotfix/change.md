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
4. **AC-4** The provider's failure reason (the API error message) reaches the server log, so the next failure of this kind can be diagnosed without a reproduction.

## Tasks

## Verify
