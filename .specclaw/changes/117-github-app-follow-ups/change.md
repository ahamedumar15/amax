# GitHub app follow-ups: a mismatch return caught wherever it lands, a wrong secret said plainly, and "configured" means usable

**Change:** 117-github-app-follow-ups · **Created:** 2026-11-16 · **Review:** change

## Problem

116 stopped at the five-pass review cap with three majors open (its `follow-ups.md`, round 5):

1. GitHub's own `error=redirect_uri_mismatch&state=…` return is forwarded to the callback only from the homepage, but a
   wrong Redirect URI can name any page.
2. A mistyped Client secret (`incorrect_client_credentials` at the token exchange) reads "GitHub didn't answer… Try
   again", which can never succeed.
3. "Configured" is only `hasSecret`, so the nudge, the Admin suggestions and the Integrations chip can call a value
   that `app()` refuses "Configured". The read side and the write side also check the format differently.

Asked by the product owner (2026-11-16): fix them on the 116 branch.

## Mock Delta

What changes on screen, and where to see it: [`117-github-app-follow-ups`](../../mock/index.html#117-github-app-follow-ups)

No new screen. Git accounts gains one result line for a wrong secret, and the Integrations row can say "Incomplete".

## Acceptance Criteria

1. **AC-1** The proxy (`apps/web/proxy.ts`) sends any page request carrying `error=redirect_uri_mismatch` and a
   `state` to `/api/git/github/callback` with those two values, whatever its path and whether or not anyone is signed
   in, so the claim is recorded as `callback`. Overview's own forward is removed. The callback route itself is never
   redirected.
2. **AC-2** At the token exchange, each GitHub error that only an Admin can fix (`incorrect_client_credentials`,
   `redirect_uri_mismatch`) maps to a result that says what to fix. A wrong Client ID or secret gives the new result
   `credentials`: "GitHub wasn't connected: GitHub refused the app's Client ID
   or secret. An Admin replaces the GitHub app (Settings › Integrations)". It is never "Try again".
3. **AC-3** One `parseGitHubApp(value)` in `modules/git-accounts/server/app.ts` decides whether a stored value is a
   usable `<client id>:<client secret>`. It is used by:
   - `app()` (the reader)
   - `checkClientId` / `checkClientSecret` (the writer)
   - the status, which gains `incomplete`

   `configured` is true only when the value parses. An unparseable value shows "Incomplete" on Integrations, gets the
   Admin's **Set up the GitHub app** suggestion (not Rotate), and shows no Overview nudge.
4. **AC-4** Variant tests for each, the git-accounts and admin suites and the git-accounts e2e pass, and nothing in
   116's acceptance criteria changes.

## Tasks

## Verify

<!-- Filled by verify: a **Verdict:** PASS|FAIL line, then one `- AC-n: pass|fail — evidence`
     line per criterion, quality before → after, preset check, and screenshot paths
     (or "compared by eye: <who>"). -->
