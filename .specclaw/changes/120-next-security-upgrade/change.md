# Next.js security upgrade: move off 16.4.2, which has a known vulnerability

**Change:** 120-next-security-upgrade · **Created:** 2026-11-17 · **Review:** change

## Problem

`next dev` reports that Next.js 16.4.2 is affected by a known security vulnerability and recommends upgrading. Since
2026-11-17 it also stops at start until the upgrade is done. Asked by the product owner (2026-11-17): run
`next upgrade --agent=security` and follow its instructions.

## Mock Delta

What changes on screen, and where to see it: [`120-next-security-upgrade`](../../mock/index.html#120-next-security-upgrade)

No screen change: only the framework version.

## Acceptance Criteria

1. **AC-1** Next.js is upgraded to the version `next upgrade --agent=security` selects, with the other changes it asks
   for, in this checkout (no worktree or branch is made; the Git steps are the product owner's).
2. **AC-2** `pnpm install` is clean and the lockfile matches; `turbo lint` (typecheck) for web passes; the web test
   suite passes; and `next dev` starts and serves `/signin`.

## Tasks

- [x] `T1` — Run the security upgrade and follow its instructions (AC-1)
  Files: apps/web/package.json, pnpm-lock.yaml
- [x] `T2` — Install, typecheck, test and start the app (AC-2)

## Verify

<!-- Filled by verify: a **Verdict:** PASS|FAIL line, then one `- AC-n: pass|fail — evidence`
     line per criterion, quality before → after, preset check, and screenshot paths
     (or "compared by eye: <who>"). -->
