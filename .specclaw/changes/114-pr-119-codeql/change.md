# PR #119's CodeQL alerts: the mock escapes what it puts in HTML, logs stay one line, the fake GitHub stays local

**Change:** 114-pr-119-codeql · **Created:** 2026-11-16 · **Review:** change

## Problem

PR #119 passes every CI job but CodeQL, which reports 19 new alerts: 4 high in the clickable mock's script (text put back
into HTML unescaped, and two regular expressions whose anchor covers only one alternative), 2 medium (a log line that can
carry a caller's newline, and the e2e fake GitHub redirecting to a URL from its query), 3 warnings (a test passing an
argument its step ignores) and 10 notes (unused imports and variables, a missing semicolon). Asked by the product owner
(2026-11-16): fix them all.

## Mock Delta

What changes on screen, and where to see it: [`114-pr-119-codeql`](../../mock/index.html#114-pr-119-codeql)

No screen change: the mock looks the same; its script escapes what it inserts.

## Acceptance Criteria

1. **AC-1** The mock's script escapes every text it puts into HTML (the phone nav sheet, the charts' hidden tables) and
   its amount parser anchors both alternatives (`/^(k|thousand)/`, `/^(m|million)/`); the deployed copy
   (`apps/mock/public/mock/index.html`) matches the spec mock.
2. **AC-2** `logError` writes one line whatever its scope or the error's code holds: only letters, digits and `.:_-`.
3. **AC-3** The e2e fake GitHub redirects only to a `http://localhost:` callback.
4. **AC-4** The warnings and notes are gone: the review-gate test's steps take the argument they are given, and the
   unused imports and variables are removed, except `SHA_RE` in the generated `plugins/amax/scripts/read-specclaw.mjs`,
   which esbuild keeps from `modules/delivery/sync/sha.ts` where it is used.

## Tasks

- [x] `T1` — The mock escapes and anchors; its deployed copy refreshed (AC-1)
  Files: .specclaw/mock/index.html, apps/mock/public/mock/index.html
- [x] `T2` — One-line logs, a local-only fake GitHub, and the warnings and notes (AC-2, AC-3, AC-4)
  Files: packages/core/src/log.ts, apps/web/tests/e2e/git-accounts.spec.ts, packages/testing/tests/review-gate-covered.test.ts,
  modules/time/server/my.ts, modules/delivery/ui/ReleasesPage.tsx, modules/delivery/tests/sync-import.test.ts,
  modules/delivery/tests/mcp-registry.test.ts, modules/delivery/tests/delivery.test.ts, modules/delivery/tests/chat.test.ts

## Verify

<!-- Filled by verify: a **Verdict:** PASS|FAIL line, then one `- AC-n: pass|fail — evidence`
     line per criterion, quality before → after, preset check, and screenshot paths
     (or "compared by eye: <who>"). -->
