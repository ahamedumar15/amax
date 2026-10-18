# CI flake fixes: admin tools timeout and audit alert locator

**Change:** 056-ci-flakes · **Created:** 2026-10-17
**Lane:** Platform · **Fixes tests from:** [047](../archive/047-admin-end-to-end/change.md), [050](../archive/050-immutable-trace/change.md)

## Problem

Two tests fail intermittently on CI and blocked the archive PR (#44) twice:
- `apps/web/tests/admin/tools.test.ts` AC2 runs 8 full chat turns and confirms against Postgres. Each confirm takes the audit and trace advisory locks. On a busy runner this goes past vitest's 5s default, and AC3 and AC6, which read AC2's writes, then fail too.
- `apps/web/tests/e2e/audit.spec.ts:57` uses `getByRole("alert")`, which also matches Next's empty `#__next-route-announcer__` (role=alert). Playwright's strict mode then fails whenever the announcer is already mounted.

## Mock Delta

None. Test-only.

## Acceptance Criteria

1. **AC-1** AC2 in `tools.test.ts` has a 60s per-test timeout, following the repo convention (`}, 60_000);`).
2. **AC-2** The audit e2e locates the alert by its text, so the route announcer can't make it ambiguous.
3. **AC-3** Unit tests and the signed-in e2e suite pass locally, and CI goes green on the PR.

## Tasks

- [x] `T1` — timeout on the admin tools AC2 test; alert locator filtered by text (AC-1, AC-2)
  Files: apps/web/tests/admin/tools.test.ts, apps/web/tests/e2e/audit.spec.ts

## Verify
