# Follow-ups

Deferred by the review loop: minors and pre-existing findings.

- [minor B4] `modules/compliance/tests/registers.test.ts:41` The pinned clock hard-codes the fixtures' day ("2026-10-16T08:00:00Z"). The Payslip breach's date lives separately in modules/compliance/fixtures/data.ts:30 (awareAt "2026-10-16T02:00:00Z"), and its deadline is hard-coded again at line 49. These are three copies of the same date. If the fixtures are moved to a new date (the repo has done this before for date drift), the clock stays at the old date. The new breach's last week can then overlap the Payslip breach's again, and the daysLeft: 5 check at line 57 starts depending on when the test runs. Fix: work out the clock from the fixture's awareAt (export it from fixtures/data.ts), or add a comment at the fixture that ties the two together. (round 1) <!-- fp:60fa6688833b -->
