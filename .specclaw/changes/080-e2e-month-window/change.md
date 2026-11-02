# e2e: the allocations copy test follows the month window

**Change:** 080-e2e-month-window · **Created:** 2026-11-02 · **Review:** change

## Problem

`e2e:auth` fails on `14873d51` (69 passed, 1 failed, 12 not run) at `apps/web/tests/e2e/chat-first.spec.ts:21`. The
allocations page's "Ask amax to copy a month" prompt names the grid's first month, which is the current month (now
"November (2026-11)"), and the test expects October. It also finds Kasun's January total at a fixed `td.nth(5)`, but the
grid shows five months from now, so that cell is February in November. 079 reached its five review passes, so this is
its own change.

## Mock Delta

What changes on screen, and where to see it: [`080-e2e-month-window`](../../mock/index.html#080-e2e-month-window)

No screen changes. The mock section notes that.

## Acceptance Criteria

1. **AC-1** `chat-first.spec.ts` "054 AC5 allocations" matches the copy prompt by its shape (`Copy Delivery team
   allocations from <Month> (<yyyy-mm>) to the next month`), not by one month, then replaces it with December 2026 as
   before. The prompt's first month must be 2026-09 to 2027-01: the windows whose "Jan" column is the fixtures' January
   2027, the month the December 2026 copy writes. Outside it the test fails on the prompt, naming the month. (Review
   round 1: the grid's headers carry no year, so without this the "Jan" read and the write could be different years.)
2. **AC-2** The test finds Kasun's January total by the grid's "Jan" column header, not by position, and checks it reads
   0% before the copy and not 0% after.
3. **AC-3** `pnpm --filter @amax/web e2e:auth` passes on Linux as CI runs it (the Docker replica of the `checks` job),
   in November 2026, with no test skipped.

## Tasks

- [x] `T1` — Allocations copy test matches the prompt's shape and finds January by its column header (AC-1, AC-2)
  Files: apps/web/tests/e2e/chat-first.spec.ts
- [x] `T2` — Run `e2e:auth` in the Linux replica of CI's checks job (AC-3)
  Files: .specclaw/changes/080-e2e-month-window/change.md
  Depends: T1

## Verify

Build notes, 2026-11-02:

- T1: `pnpm --filter @amax/web exec tsc --noEmit -p .` exit 0. A missing "Jan" header fails the test
  (`expect(janColumn).toBeGreaterThan(1)`) instead of `nth(-1)` silently reading the last cell.
- T2: Docker replica of CI's checks job e2e steps (`node:24-bookworm`, fresh `postgres:16-alpine`, `CI=1`, a
  `git archive` of `14873d51` plus this change's edits): install, `db:migrate`, `pnpm build` all exit 0;
  `pnpm --filter @amax/web e2e` 8 passed; `pnpm --filter @amax/web e2e:auth` **82 passed**, 0 failed, none skipped.
- Quality: not_run (`specclaw-quality-scan` exit 126, jq "Argument list too long", as in 066–079).
- Not committed: Git is read-only for the agent; `specclaw-build setup` and the commit steps were left to the owner,
  on the PR branch `specclaw/073-time-workflow-enhancements`.

