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

**Verdict:** PASS

- AC-1: pass — `toolInputSchema` turns the `place_legal_hold` union into one `type: "object"` schema (merged properties, `kind` as an enum, `required` = kind and reason); `packages/ai/tests/tool-schema.test.ts`. Sending all 289 registered tools to the real API now returns 200 (it returned `400 tools.219.custom.input_schema.type: Field required` before).
- AC-2: pass — `apps/web/tests/tool-schemas.test.ts` checks every tool in `toolRegistry()`. With the old `z.toJSONSchema` it flags `allow_inbox_source` and `place_legal_hold`.
- AC-3: pass — the gateway still runs `tool.input.safeParse` before a tool runs; the test shows the union rejects a matter hold with no matter or ids.
- AC-4: pass — a provider error with status 400 and type `invalid_request_error` throws `AiOutputError` with code `400 invalid_request_error`; `logError` prints that code and not the message (`packages/ai/tests/gateway.test.ts`, DB suite on).

Commands (`DATABASE_MIGRATE_URL` on local test Postgres):
- `turbo run test --force` exit 0 (35/35 tasks); `turbo run lint --force` + `check-graph` exit 0 (22 modules, 11 packages); `pnpm build` exit 0.
- `pnpm --filter @amax/web e2e` exit 0 (8 passed); `pnpm --filter @amax/web e2e:auth` exit 0 (82 passed).

Notes:
- Cause found in prod: `ai.call` shows every chat since 2026-10-19 failing on both haiku and sonnet; the API key works; the 400 reproduces with the registered tool list.
- `specclaw-preset-check .`: only the repo-wide `comment` rule; no hits in 069 files.
- Quality: `specclaw-quality-scan` not_run (jq "Argument list too long", as in 066–068).
- Screenshots: no UI change. `shots/mock.png`; chat is checked on the live app after deploy.
- specclaw-review: not run per change (operator rule: review once per module end).
