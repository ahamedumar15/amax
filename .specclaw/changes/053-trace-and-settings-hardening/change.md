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

## Verify
