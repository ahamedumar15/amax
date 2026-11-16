# PR #119's CI goes green: a test loads HR the way the app loads modules

**Change:** 113-pr-119-ci-green · **Created:** 2026-11-16 · **Review:** change

## Problem

PR #119's `checks` job fails at the module graph check: `modules/allocations/tests/no-hr-107.test.ts` imports
`@amax/hr/module`, another module's internals (rule R1). The check reports "0 modules" on Windows, so 107's local runs
never saw it. The fix comes after 107's final review pass, so it is its own change (as 095 and 105 were).

## Mock Delta

What changes on screen, and where to see it: [`113-pr-119-ci-green`](../../mock/index.html#113-pr-119-ci-green)

No screen change.

## Acceptance Criteria

1. **AC-1** `no-hr-107.test.ts` loads HR through the test setup's `installed()`, the way the app loads installed modules,
   and the module graph check passes with every module counted (on Linux, as CI runs it).

## Tasks

- [x] `T1` — The test loads HR through `installed()`; the setup exports it (AC-1)
  Files: modules/allocations/tests/setup.ts, modules/allocations/tests/no-hr-107.test.ts

## Verify

<!-- Filled by verify: a **Verdict:** PASS|FAIL line, then one `- AC-n: pass|fail — evidence`
     line per criterion, quality before → after, preset check, and screenshot paths
     (or "compared by eye: <who>"). -->
