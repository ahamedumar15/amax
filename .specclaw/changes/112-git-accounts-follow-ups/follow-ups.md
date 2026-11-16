# Follow-ups

Deferred by the review loop: minors and pre-existing findings.

- [minor B2] `apps/web/tests/e2e/git-accounts.spec.ts:63` AC-5 says a signed-out return goes to sign-in and then back to the callback. The test only checks the redirect to /signin with a `next` that starts with the callback path. It never signs in, so it never checks that the browser lands back on the callback and then on /git-accounts. Sign in on that page and assert the final URL. (round 1) <!-- fp:d96a63dafd67 class:other -->
