# Follow-ups

Deferred by the review loop: minors and pre-existing findings.

- [minor B1] `apps/mock/public/mock/index.html:3813` The rename changed the section ids and data-change values to 138–151, but the visible ledes and the HTML banner comments still use the old numbers. Examples: '116: an Admin sets up…', '<!-- 122 Project tabs layout -->' on the section now id'd 144, '123: a release gets a name…' on 145, and '129: the New release card…' on 151. The same applies to the '// 125:' prefix in apps/web/tests/e2e/delivery-visual.spec.ts:15, which now sits beside a reference to 147-release-pages. Fix: update each lede prefix and banner comment to the new number, the same way the ids were updated. (round 1) <!-- fp:a0d6e4bf7689 class:other -->
