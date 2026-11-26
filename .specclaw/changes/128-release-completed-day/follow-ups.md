# Follow-ups

Deferred by the review loop: minors and pre-existing findings.

- [minor B2] `modules/delivery/tests/release-completed-day-128.test.ts:69` The 'completed release without its day is refused' test relies on the release 'b-utc', which the AC-3 test creates. Run alone (`it.only`, or a filtered run), it updates no rows and the expected rejection never comes, so it fails for the wrong reason. It also depends on AC-3 putting the 0027 constraint back. Fix: create its own completed release inside the test. (round 1) <!-- fp:b636523e56d8 class:other -->
