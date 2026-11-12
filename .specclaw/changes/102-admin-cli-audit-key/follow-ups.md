# Follow-ups

Deferred by the review loop: minors and pre-existing findings.

- [minor B2] `packages/auth/tests/admin-cli-102.test.ts:64` The AC-4 test is named 'each command exits on its own', but it only runs scim-token. That is the one command whose runtime setup this change did not touch. The exit of principal-add and user-deactivate (the commands that now call configureRuntime) is proven only indirectly, through spawnSync's timeout in AC-1 and AC-2. Either run the two audited commands in AC-4 and assert that `error` and `signal` are unset, or rename the test. (round 1) <!-- fp:93b51ab112cd -->
- [pre-existing, same class as round 1's B6] `modules/delivery/sync/bin.ts:20` checks only that `AUDIT_HASH_KEY` is set and passes `process.env` straight to `configureRuntime`, so it accepts a key under 32 characters that the app refuses at boot. Read it through core's `loadEnv()`, as `packages/auth/bin/admin.ts` now does. Out of 102's scope (another module); its own change.
