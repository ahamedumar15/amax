# Follow-ups

Deferred by the review loop: minors and pre-existing findings.

- [minor B11] `modules/git-accounts/server/app.ts:41` The ForbiddenError branch of `problemOf` and the `REFUSED_USE` string can no longer run. `stateOf` now always checks through `contextFor.job(...)`, a system context that `secrets:use:github-oauth` never refuses, and `appUsable` is `problemOf`'s only caller. Only problem-117.test.ts still reaches it. Delete the branch and the string, along with the test row for them. Separately, `setAppCheckMs` is a mutable module-level test seam exported from production code. Inject the clock or TTL in the test instead, or at least keep the setter out of the module's public surface. (round 1) <!-- fp:d75c8a1fff92 class:other -->
