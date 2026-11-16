# Git accounts follow-ups: commits credited by account, results the screen can trust, one callback slot

**Change:** 112-git-accounts-follow-ups · **Created:** 2026-11-16 · **Review:** change

**Builds on:** 108-connect-github (its two majors and three minors open at the pass-5 cap; `## Verify` and
`follow-ups.md`).

## Problem

108 stopped at the review cap with two majors open. Delivery credits a commit to whoever holds its GitHub login, without
the account id 108 now stores, so a renamed login that someone else reuses is credited to its first holder until they
reconnect. And the Git accounts screen takes its result from the URL (the skipped count, the failure reason), so anyone
can send a link that tells a person something false. Three minors ride along: the callback slot is declared twice, the
architecture doc doesn't say the app may read a slot, and a lapsed session on GitHub's return gives a bare 404.

## Mock Delta

What changes on screen, and where to see it: [`112-git-accounts-follow-ups`](../../mock/index.html#112-git-accounts-follow-ups)

No new screen. The Git accounts note after GitHub's return reads from the person's own connect record; a link that
doesn't match one says only "amax can't say how that GitHub connect went", and nothing when you're connected.

## Acceptance Criteria

1. **AC-1** A commit is credited through a GitHub identity that was connected (it has GitHub's account id) only when the
   commit's email is one of that person's verified GitHub emails, so a renamed login reused by another GitHub user is
   never credited to its first holder. An identity linked before 108 (no account id) is credited as before.
2. **AC-2** The note after GitHub's return comes from that return's own record on its connect state (the result and the
   skipped count, the first outcome standing), read by id for the viewer within the last 10 minutes. With no such record
   it says only "amax can't say how that GitHub connect went. To try again, ask amax to connect GitHub.", or nothing for
   someone connected; never a claim from the URL.
3. **AC-3** The callback slot's name and type are declared once, in `@amax/core`, and both the app's route and the module
   use that declaration.
4. **AC-4** `docs/architecture.md` says the app may also read a slot, where that slot is declared, and names this one.
5. **AC-5** GitHub's return to a signed-out browser goes to sign-in and back to the callback, never a bare 404.

## Tasks

<!-- Added by plan, UI first, then backend, then integration, in tasks.md's task-line
     format: checkbox, `Tn`, em dash, title; then indented Files: and optional Depends: lines. -->

- [x] `T1` — The screen trusts only the record: connect states keep their result and skipped count; the note reads the
  viewer's latest one within 10 minutes, and an unmatched URL code shows only the fixed sentence (AC-2)
  Files: modules/git-accounts/db/migrations/0002_connect_result.sql, modules/git-accounts/server/connect.ts,
  modules/git-accounts/server/callback.ts, modules/git-accounts/server/read.ts, modules/git-accounts/ui/ResultNote.tsx,
  modules/git-accounts/ui/GitAccountsPage.tsx, modules/git-accounts/tests/result-112.test.ts
- [x] `T2` — Commits credited by account: a connected identity credits a commit only for one of its person's verified
  GitHub emails (AC-1)
  Files: modules/delivery/server/ingest.ts, packages/auth/src/git-identity.ts, modules/delivery/tests/ingest-112.test.ts
- [x] `T3` — One slot declaration, the doc, and sign-in on a lapsed return (AC-3, AC-4, AC-5)
  Files: packages/core/src/slots.ts, packages/core/src/server.ts, apps/web/app/api/git/github/callback/route.ts,
  modules/git-accounts/server/callback.ts, docs/architecture.md

## Verify

<!-- Filled by verify: a **Verdict:** PASS|FAIL line, then one `- AC-n: pass|fail — evidence`
     line per criterion, quality before → after, preset check, and screenshot paths
     (or "compared by eye: <who>"). -->

Quality: not_run (specclaw-quality-scan: jq "Argument list too long" on this Windows host)
