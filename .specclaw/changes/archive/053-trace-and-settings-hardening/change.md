# Trace and settings hardening

**Change:** 053-trace-and-settings-hardening · **Created:** 2026-10-17
**Lane:** Platform · **Depends on:** [050](../archive/050-immutable-trace/change.md), [052](../052-settings-review/change.md)

## Problem

The settings module review (052) hit its 5-round cap with 7 majors open. Two of them, which it escalated, share one cause: if the trace store fails to write a step, the person or the model is told a different outcome than what happened. Each round patched one call site and the next round found another. The other five are small correctness gaps on the Keys screen, the settings hub and the time-zone tool. See `052-settings-review/follow-ups.md` under "Open after the 5-round cap".

## Mock Delta

What changes on screen, and where to see it: none. Fixes only; screens stay as in 047, 048 and 050.

## Acceptance Criteria

1. **AC-1** `traceStep` in `packages/core/src/trace.ts` is best-effort: a store failure is logged with `logError` and never thrown. A separate `traceStepOrFail` throws, and only confirm's `run` step uses it. The per-call-site `.catch` wrappers in `registry.ts` and `engine.ts` are removed.
2. **AC-2** `npm run check:graph` (or a lint rule) fails if anything other than `packages/chat/src/engine.ts` imports `traceStepOrFail`.
3. **AC-3** `runTurn` writes the pending step before it pushes the card. If that step can't be written, no card is proposed, and the model is told so.
4. **AC-4** One table test runs every trace call site (turn, pending, tool_call, decided confirm, decided cancel, mcp_call, job_run) against a failing trace store. The outcome is unchanged everywhere except the single fail-closed site.
5. **AC-5** On the Keys screen, expired credentials ask for a new expiry instead of offering "keep expiry". `keptExpiry` is checked when the card is proposed, not after the value is typed.
6. **AC-6** Each Keys ticket pins a filtered `list_secrets` (expiring, rotated, all) that returns exactly what the ticket counts.
7. **AC-7** The settings hub uses the shared `expiringSoon` and doesn't count a credential past its expiry as expiring. Its AI card is built from `aiUsageTotals` and `costLabel`, so calls with no price show as unknown, never $0.
8. **AC-8** `set_entity_zone` refuses an ambiguous entity name and lists the candidates, the same way `findSchedule` does.
9. **AC-9** Every fix has a test that fails without it. Typecheck, unit tests, lint and both e2e suites stay green.

## Tasks

- [x] `T1` — Keys screen: expired rows ask for a new expiry, tickets pin filtered `list_secrets` (AC-5, AC-6)
  Files: apps/web/app/(app)/settings/keys/KeyTable.tsx, apps/web/app/(app)/settings/keys/KeyTickets.tsx, apps/web/app/(app)/settings/keys/format.ts, apps/web/lib/admin/credentials.ts
- [x] `T2` — `list_secrets` filter and `rotate_secret` checks `keptExpiry` when chat proposes the card, through a new optional `propose` hook on `McpToolDef` (AC-5, AC-6)
  Files: apps/web/lib/admin/secrets.ts, packages/core/src/module.ts, packages/chat/src/engine.ts
  Depends: T1
- [x] `T3` — Settings hub uses the shared `expiringSoon` and builds its AI card from `aiUsageTotals` and `costLabel`; `set_entity_zone` refuses an ambiguous entity name (AC-7, AC-8)
  Files: apps/web/lib/admin/status.ts, apps/web/lib/admin/workflows.ts
  Depends: T1
- [x] `T4` — Split `traceStep` (best-effort, logged, returns whether it was written) from `traceStepOrFail`; remove the per-call-site `.catch` wrappers; job_run goes best-effort; `runTurn` writes the pending step before the card (AC-1, AC-3)
  Files: packages/core/src/trace.ts, packages/core/src/server.ts, packages/core/src/jobs.ts, packages/mcp/src/registry.ts, packages/chat/src/engine.ts
- [x] `T5` — Graph check R8: only `packages/chat/src/engine.ts` may use `traceStepOrFail` (AC-2)
  Files: scripts/graph/rules.mjs, scripts/check-graph.mjs, packages/testing/boundaries/r8-trace-or-fail/, packages/testing/tests/ac3-boundaries.test.ts
  Depends: T4
- [x] `T6` — Tests: one table test over every trace call site against a failing trace store, plus a failing-first test per settings fix; typecheck, unit, lint, both e2e suites (AC-4, AC-9)
  Files: packages/chat/tests/trace-store-down.test.ts, packages/chat/tests/decided-trace-fail.test.ts, packages/mcp/tests/registry-step.test.ts, apps/web/tests/admin/hardening-053.test.ts
  Depends: T2, T3, T4, T5

## Verify

**Verdict:** PASS

- AC-1: pass — `traceStep` (packages/core/src/trace.ts) catches, logs with `logError` and resolves `false`; `traceStepOrFail` throws and is called only for confirm's `run` decided step. The `.catch` wrappers in registry.ts and engine.ts are gone; job_run goes through the same best-effort `traceStepIn`.
- AC-2: pass — graph rule R8 (scripts/graph/rules.mjs) scans modules, packages and apps; fixture `packages/testing/boundaries/r8-trace-or-fail` fails on a package and an app file and passes the chat engine (`ac3-boundaries.test.ts`).
- AC-3: pass — `runTurn` writes the pending step first; on `false` no card is pushed and the model gets `not_proposed` (table row "pending").
- AC-4: pass — `packages/chat/tests/trace-store-down.test.ts`: a real Postgres trigger fails `core.trace_event` inserts per kind; 11 rows (turn, tool_call, pending, decided confirm ×5, decided cancel, mcp_call, job_run). Only confirm `run` changes outcome (fails closed, write never runs). Without the fix, 5 rows fail.
- AC-5: pass — expired rows prompt "Rotate … and set a new expiry date"; `rotate_secret.propose` runs `keptExpiry` when chat proposes the card (`hardening-053.test.ts` AC-5: no card for the expired credential, the model is told why).
- AC-6: pass — `list_secrets { filter: all | expiring | rotated }`; tickets pin their filter; AC-6 test asserts each filter returns exactly the ticket's rows.
- AC-7: pass — hub uses shared `expiringSoon`/`pastExpiry` (lib/admin/credentials.ts) and `aiUsageTotals` + `costLabel`; tests cover past-expiry and an unpriced call shown as unknown.
- AC-8: pass — `set_entity_zone` refuses a name matching 2 entities and lists names with ids; the id still resolves.
- AC-9: pass — each new test failed with the source changes stashed (5/11 table rows; all 4 settings tests). All checks green.

Commands (exit codes):
- `pnpm lint` (turbo tsc + check-graph): 0
- `DATABASE_MIGRATE_URL=… npx turbo run test --concurrency=2`: 0 (16/16 packages)
- `pnpm build`: 0
- `E2E_PORT=3554 npx playwright test`: 0 (1 passed)
- `E2E_DB=amax_e2e_053 E2E_AUTH_PORT=3553 npx playwright test --config playwright.auth.config.ts`: 0 (47 passed, including 031 AC4 Keys screen within 2% of its mock)
- `specclaw-preset-check .`: no violations in this change's new files (repo-wide violations pre-exist)
- Quality: not_run (`specclaw-quality-scan` fails: jq "Argument list too long")
- specclaw-review: not run (operator: review once per module end)

Screenshots: `shots/mock.png` (031 Keys mock). No mock delta; the Keys screen's mock comparison is the 2% diff in `secrets.spec.ts`, which passed.
