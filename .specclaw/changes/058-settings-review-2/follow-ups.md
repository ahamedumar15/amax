# Follow-ups

Deferred by the review loop: minors and pre-existing findings.

- [minor B7] `packages/core/src/privacy/requests.ts:34` The duplicate-request check is a read followed by an insert, with no unique constraint, so two concurrent opens both succeed. Fix: add a partial unique index on (tenant_id, subject_user_id, kind) where status in ('open','approved'). (round 1) <!-- fp:4c0784f0fde8 -->
- [fixed in round 2] [minor B4] `packages/core/src/privacy/approval.ts:11` twoPersonRule compares `ctx.actor.id` with `openedBy`, but openedBy and approved_by are written with personOf(ctx) (onBehalfOf ?? actor.id). The SQL gate compares approved_by with opened_by, so the two checks use different identities and can disagree. Compare personOf(ctx) in both. (round 1) <!-- fp:5c46f3cbbf51 -->
- [minor B4] `apps/web/lib/privacy-fixtures.ts:15` The fixture derives subject_key with an unkeyed sha256(userId), while openPrivacyRequest uses keyed(userId). The demo row's key never matches one the service would compute. Use keyed(). (round 1) <!-- fp:0e4226bc6fe1 -->
- [minor B10] `apps/web/lib/admin/privacy.ts:11` Read tools always build their context with source 'chat' (`ctx = ctxFor(v, 'chat')`), even when called over MCP or the API, so trace and authorize see the wrong channel. Pass the tool's source through. (round 1) <!-- fp:8f001b9e2cd6 -->
- [fixed in round 2] [minor B3] `apps/web/app/(app)/settings/api/ApiTickets.tsx:20` The 'Outgoing deliveries' note is the fixed string 'Nothing sent this week', even when deliveries exist and a percentage is shown. Make it conditional on stats.deliveries.total. (round 1) <!-- fp:d927280a0d14 -->
- [minor R3] `apps/web/lib/admin/status.ts:107` The Settings hub's API card has a static chip ('Keys shown once') instead of a live status. A switched-off webhook or an expiring service credential doesn't surface on the attention-first hub. Derive the chip and attention text from apiStats and the credential list. (round 1) <!-- fp:06278e329e31 -->

## Outside this diff

- [flaky e2e] `apps/web/tests/e2e/auth.spec.ts:32` "AC5 non-admins get no View as" intermittently stays on /delivery after Sign out. Not part of 032 or 035, so not fixed here; needs its own change (likely waiting for the sign-out navigation before asserting).

