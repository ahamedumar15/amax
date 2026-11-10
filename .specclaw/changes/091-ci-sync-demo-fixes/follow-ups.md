# Follow-ups

Deferred by the review loop: minors and pre-existing findings.

- [minor B4] `modules/delivery/sync/import.ts:58` The rule for which email names the owner (`r.owner ?? r.author ?? null`) is written twice: in `desired()` at line 28 and again in the staleness pre-pass. Make it one helper so the staleness check and the write can't drift apart. (round 1) <!-- fp:9c92bbbceaff -->
