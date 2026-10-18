# Chat write tools: one declared service each

**Change:** 043-chat-write-tool-contract · **Created:** 2026-10-17
**Lane:** Platform · **Module:** `packages/chat`, `packages/mcp`, `packages/core` · **Depends on:** [005](../005-amax-chat/change.md), [042](../042-release-management/change.md)

## Problem

042 made a chat confirm write at most once with idempotency keys (`packages/core/src/idempotency.ts`). The guarantee rests on a contract checked only at run time: a chat write tool makes exactly one `defineService` write. Every tool today keeps it, so 042 ships with it. Review round 9 showed where a tool that breaks it still gets through, and those cases arrive with the next modules (HR's contract commands call another module's service from inside a write). The product owner deferred them here on 2026-10-17 rather than hold #25.

## Acceptance Criteria

1. **AC-1** A chat write tool declares its single service when it's registered (`McpToolDef.service`), and the chat engine calls that service directly. A write tool without one can't become a confirm card; registering one fails the module-standard check.
2. **AC-2** A service called from inside another service's `run` (a contract command) gets a key derived from the outer key and isn't counted as a second top-level write; documented in the idempotency contract, with a test of a service that calls another.
3. **AC-3** The error path is fail-closed like the success path: a keyed call that threw is offered a retry only when it made exactly one pipeline write and the key holds no outcome; otherwise the card closes as unknown. A cancel that loses to a write recorded as unknown is overwritten with unknown, never left as "cancelled".
4. **AC-4** One key lookup: the replay is a discriminated value, not cast to the service's result type; a wrapped `CancelledByKeyError` and a stored `{ cancelled }` both map to "cancelled".
5. **AC-5** Replays are bound to the actor that wrote them: a replay for a different actor is refused, so a key can't be used to read past authorize.
6. **AC-6** Tests drive the real failure paths (a settle that fails after the service commit) and table the refusal kinds (authorize, validation, registry pre-check).

## Source

Review round 9 of 042, findings on `packages/chat/src/engine.ts`, `packages/core/src/idempotency.ts`, `packages/core/src/service.ts` and `modules/delivery/tests/chat.test.ts` (`.specclaw/changes/042-release-management/review/round-9.json`).

## Tasks

No UI: the confirm card keeps its look; only which tools can make one, and how a confirm ends, change.

How AC-1 is met: `McpToolDef.service` names the tool's `defineService` result. On a chat confirm the engine
runs the tool with the key scoped to that service. The first top-level write from any other service is
refused before it runs (a non-retryable `UndeclaredWriteError`), so "exactly one write, and it's the
declared one" holds before the write, not just after it. A write made around `defineService` can't be
seen at run time, so `check:modules` closes that gap statically: every `scope: "write"` tool must name its service.

- [ ] `T1` — Core idempotency: declared-service scope, nested keys, one discriminated lookup (AC-1, AC-2, AC-4)
  Files: packages/core/src/module.ts, packages/core/src/idempotency.ts, packages/core/src/service.ts, packages/core/src/server.ts, packages/core/tests/idempotency-043.test.ts
- [ ] `T2` — Replays bound to the actor that wrote them; a different actor's lookup is refused (AC-5)
  Files: packages/core/src/idempotency.ts, packages/core/src/service.ts, packages/core/tests/idempotency-043.test.ts
  Depends: T1
- [ ] `T3` — Chat engine: no card without a declared service; fail-closed error path; cancel that loses to an unknown write becomes unknown; wrapped or stored cancel both read "cancelled" (AC-1, AC-3, AC-4)
  Files: packages/chat/src/engine.ts, packages/mcp/src/registry.ts
  Depends: T1, T2
- [ ] `T4` — Every write tool declares its service, and `check:modules` fails a write tool that declares none (AC-1)
  Files: modules/*/mcp.ts, packages/chat/src/tools.ts, packages/agents/src/mcp.ts, apps/web/lib/admin/*.ts, scripts/check-module-standard.mjs, docs/module-standard.md
  Depends: T1
- [ ] `T5` — Tests for the real failure paths (settle fails after the service commit, raw write then throw, raw write against cancel), a table of refusal kinds (authorize, validation, registry pre-check), and the idempotency contract documented (AC-2, AC-3, AC-6)
  Files: packages/chat/tests/confirm-043.test.ts, modules/delivery/tests/chat.test.ts, docs/architecture.md
  Depends: T3, T4

## Verify
