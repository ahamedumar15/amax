# Follow-ups

Deferred by the review loop: minors and pre-existing findings.

- [minor B2] `modules/delivery/tests/repo-sync-096.test.ts:85` The AC-4 `releasedAt` bound is tested only through `syncProposal`, and with two variants. The push (`sync_specclaw` → `upsertSpecProposal`) is the main writer and has no test for a future or malformed `releasedAt`, so 'every writer' isn't shown. Add push-path rows for a future time, a time with no offset, and a past time. (round 1) <!-- fp:f509ccc818e9 -->
