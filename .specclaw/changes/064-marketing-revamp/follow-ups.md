# Follow-ups

Deferred by the review loop: minors and pre-existing findings.

- [minor B10] `apps/web/components/marketing/Bands.tsx:15` [design] The 'Coming' paragraph now sits outside the hidden `.more`. A band that starts switched off (Finance and sales, Operations) shows only its Coming items and hides everything that has shipped, so the closed view leans on what isn't built. If the goal was just to keep 'Coming' visible, consider keeping it inside `.more`, or showing both lists when a band is off. (round 1) <!-- fp:c539358c9079 -->
- [minor B1] `apps/web/components/marketing/ProductVideo.tsx:20` `tabIndex={0}` fixes the after-play state but adds a problem before play. While `started` is false the video has no controls but is still a Tab stop, and it comes before the Play button in DOM order. A keyboard user first lands on a video that Space and Enter don't operate, and only the next Tab reaches the Play button. Fix: set `tabIndex={started ? 0 : -1}`. Both values still let `play()` call `focus()` in the same tick, before `controls` renders. Then add a check that the first Tab into the tour lands on the Play button. (round 2) <!-- fp:1ba795a897cc -->
