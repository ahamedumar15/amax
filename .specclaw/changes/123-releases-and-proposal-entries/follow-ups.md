# Follow-ups

Deferred by the review loop: minors and pre-existing findings.

- [minor B11] `modules/delivery/module.ts:122` The new `delivery.release-off-track` rule has no `except`, and `ReleaseStatusChanged` carries no `by`. When the PM's own edit moves the release to overdue (`update_release` with a target in the past, or `create_release` with one), the PM gets an urgent notice about their own action. The other Delivery owner rules leave out the person who acted (`except: "by"`). Fix: add `by` to the payload for create and update sources (null for schedule) and set `except: "by"`. (round 1) <!-- fp:f6eee8e28121 class:other -->
