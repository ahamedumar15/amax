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

- [x] `T1` — Core idempotency: declared-service scope, nested keys, one discriminated lookup (AC-1, AC-2, AC-4)
  Files: packages/core/src/module.ts, packages/core/src/idempotency.ts, packages/core/src/service.ts, packages/core/src/server.ts, packages/core/tests/idempotency-043.test.ts
- [x] `T2` — Replays bound to the actor that wrote them; a different actor's lookup is refused (AC-5)
  Files: packages/core/src/idempotency.ts, packages/core/src/service.ts, packages/core/tests/idempotency-043.test.ts
  Depends: T1
- [x] `T3` — Chat engine: no card without a declared service; fail-closed error path; cancel that loses to an unknown write becomes unknown; wrapped or stored cancel both read "cancelled" (AC-1, AC-3, AC-4)
  Files: packages/chat/src/engine.ts, packages/mcp/src/registry.ts
  Depends: T1, T2
- [x] `T4` — Every write tool declares its service, and `check:modules` fails a write tool that declares none (AC-1)
  Files: modules/*/mcp.ts, packages/chat/src/tools.ts, packages/agents/src/mcp.ts, apps/web/lib/admin/*.ts, scripts/check-module-standard.mjs, docs/module-standard.md
  Depends: T1
- [x] `T5` — Tests for the real failure paths (settle fails after the service commit, raw write then throw, raw write against cancel), a table of refusal kinds (authorize, validation, registry pre-check), and the idempotency contract documented (AC-2, AC-3, AC-6)
  Files: modules/delivery/tests/chat-043.test.ts, modules/delivery/tests/chat.test.ts, packages/testing/tests/ac7-config.test.ts, docs/architecture.md
  Depends: T3, T4

## Verify

**Verdict:** PASS

- AC-1: pass — `McpToolDef.service` is declared on every write tool: 10 modules, chat, agents and admin. Wrappers carry their service's `spec`, a tool that picks by input declares a list, and `promote_opportunity` declares `null` (see BACKLOG). The chat engine runs the tool under `withIdempotency(key, …, { service })`, and any other service throws `UndeclaredWriteError` before it writes. There is no card for an undeclared tool. `createRegistry` and `check:modules` both refuse a write tool with no `service`. Tests: `packages/core/tests/idempotency-043.test.ts` "AC-1", `modules/delivery/tests/chat-043.test.ts` "AC-1", `packages/testing/tests/ac7-config.test.ts` "043 AC-1".
- AC-2: pass — a service called inside a keyed service's `run` takes `<outer>/n` and isn't counted. Its commit counts as `nested`, and a confirm with nested writes that fails closes as unknown. Documented in `docs/architecture.md` (Idempotency keys) and `packages/core/src/idempotency.ts`. Test: `idempotency-043.test.ts` "AC-2".
- AC-3: pass — the error path offers `retry` only for one declared write, nothing nested, and no stored outcome. A refusal before anything ran is failed, and anything else is unknown. `settle` rewrites a lost-race "cancelled" as unknown. Tests: `chat-043.test.ts` "AC-3 … raw then throws", "AC-3 a cancel that loses …".
- AC-4: pass — the engine does one lookup. The service throws `ReplayedError` or `CancelledByKeyError` and never casts a replay to `R`. `keyedOutcome` walks the cause chain, and a stored `{ cancelled }` after a throw maps to cancelled. Tests: `idempotency-043.test.ts` "AC-4", `chat.test.ts` "a keyed service call never returns a replay …".
- AC-5: pass — `withIdempotency(…, { by })` binds records, and chat binds to `viewer.userId`. `lookupKey` and `claimKey` refuse another actor with ForbiddenError. Binding is opt-in because presales lets another user resume a promotion series. Test: `idempotency-043.test.ts` "AC-5".
- AC-6: pass — a settle that fails after the commit (DB trigger), then a retry, gives one row and "confirmed". The refusal table (authorize, validation, registry pre-check) closes each as failed with no row. Tests: `chat-043.test.ts` "AC-6 …".

Commands (worktree, Postgres 16 at `DATABASE_MIGRATE_URL`):
- `pnpm turbo run lint` → 0 (23/23)
- `node scripts/check-graph.mjs` → 0
- `node scripts/check-module-standard.mjs` → 0
- `pnpm turbo run test --continue` → 0 (22/22 packages)
- `specclaw-preset-check .` → 1: the repo-wide comment and line-length convention (1294 on the tree). In this change's files these are the one-line intent comments the repo uses, plus the inherited lengths of `chat.test.ts`, `check-module-standard.mjs` and the new `chat-043.test.ts`, which follows its sibling's setup. Same exception as earlier changes.
- `specclaw-quality-scan . --gate` → not_run: it fails with "jq: Argument list too long" on this repo.

Screenshots: none. No screen changed, and the confirm card looks the same.
Review: skipped. Per-change review is off (`code_review: false`, product owner 2026-10-17); review runs once per module.
