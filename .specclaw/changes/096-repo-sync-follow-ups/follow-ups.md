# Follow-ups

Deferred by the review loop: minors and pre-existing findings.

- [minor B2] `modules/delivery/tests/repo-sync-096.test.ts:85` The AC-4 `releasedAt` bound is tested only through `syncProposal`, and with two variants. The push (`sync_specclaw` → `upsertSpecProposal`) is the main writer and has no test for a future or malformed `releasedAt`, so 'every writer' isn't shown. Add push-path rows for a future time, a time with no offset, and a past time. (round 1) <!-- fp:f509ccc818e9 -->
- [minor B4] `modules/delivery/sync/sha.ts:18` The 'one read rule' gives two answers. `isRead` needs a non-empty ref before `@<sha>` (`search > 0`), but `refOf` (withdraw.ts) and the author walk use the bare `AT_SHA`, which also matches a source with no ref. The new rule also stops rejecting whitespace, which the old READ did, so arbitrary text ending in `@<sha>` now counts as a read. Fix: put the ref requirement into the shared regex (for example `^(?=\S)(\S+)@(SHA)$`) so every caller applies the same rule. (round 2) <!-- fp:363317326261 -->
