# Follow-ups

Deferred by the review loop: minors and pre-existing findings.

- [minor B6] `modules/delivery/server/release-edit-card.ts:21` When the release doesn't exist, releaseEditCard returns a card with no form instead of refusing. It relies on propose to block it. Saving an unchanged edit card also sends only {projectKey, version}, and the service rejects that with 'say what to change', a message that doesn't fit a card the person never changed. Refuse missing releases here too, and say 'nothing changed' for an empty save. (round 1) <!-- fp:aea2602581e9 class:other -->
- [minor B10] `apps/web/tests/e2e/delivery-visual.spec.ts:16` The `.card.flush tbody tr` region was dropped from the releases visual check, and nothing replaced it. The new rows (name, category, status, dates, progress) now have no visual-diff coverage. Add the 125 mock section's row region instead of removing the check. (round 1) <!-- fp:3b91883b4b2e class:other -->
- [minor B10] `modules/delivery/README.md:66` The 123 paragraph still says voiding the completing record "moves completion to the earliest other valid one, or reopens it". 126 removed `reopenOnVoid`, and completed is now final. Update the 123 line, or mark it as amended by 126, so the docs don't contradict the code. (round 1) <!-- fp:4e21a43916bb class:other -->
