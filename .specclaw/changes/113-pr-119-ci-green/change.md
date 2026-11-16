# PR #119's CI goes green: a test loads HR the way the app loads modules

**Change:** 113-pr-119-ci-green · **Created:** 2026-11-16 · **Review:** change

## Problem

PR #119's `checks` job fails at the module graph check: `modules/allocations/tests/no-hr-107.test.ts` imports
`@amax/hr/module`, another module's internals (rule R1). The check reports "0 modules" on Windows, so 107's local runs
never saw it. A Linux run of the job also found the Git accounts e2e starting its fake GitHub twice on one port, the
signed-in specs since 106 running in the signed-out suite, and the Settings hub e2e still counting schedules that wait
for Australia's time zone, which 109 set. The
fix comes after 107's final review pass, so it is its own change (as 095 and 105 were).

## Mock Delta

What changes on screen, and where to see it: [`113-pr-119-ci-green`](../../mock/index.html#113-pr-119-ci-green)

No screen change.

## Acceptance Criteria

1. **AC-1** `no-hr-107.test.ts` loads HR through the test setup's `installed()`, the way the app loads installed modules,
   and the module graph check passes with every module counted (on Linux, as CI runs it).
2. **AC-2** The Git accounts e2e runs its tests one after another in one worker, so its one fake GitHub on port 3599
   never collides with a second copy (the e2e config runs files fully parallel).
3. **AC-3** The signed-in specs added since 106 (`set-up-project`, `set-up-project-fields`, `project-team`,
   `git-accounts`) run only in the signed-in suite (`e2e:auth`, its `writes` project), never in the signed-out one.
4. **AC-4** The Settings hub e2e counts what needs attention as the fixtures now are: since 109 Australia has a time
   zone, so no schedule waits for one.

## Tasks

- [x] `T1` — The test loads HR through `installed()`; the setup exports it (AC-1)
  Files: modules/allocations/tests/setup.ts, modules/allocations/tests/no-hr-107.test.ts
- [x] `T2` — The Git accounts spec runs serially (AC-2)
  Files: apps/web/tests/e2e/git-accounts.spec.ts
- [x] `T3` — The signed-in specs in the signed-in suite only; the hub's counts as the fixtures are (AC-3, AC-4)
  Files: apps/web/playwright.config.ts, apps/web/playwright.auth.config.ts, apps/web/tests/e2e/admin.spec.ts

## Verify

<!-- Filled by verify: a **Verdict:** PASS|FAIL line, then one `- AC-n: pass|fail — evidence`
     line per criterion, quality before → after, preset check, and screenshot paths
     (or "compared by eye: <who>"). -->
