# Privacy and API hardening

**Change:** 060-privacy-api-hardening · **Created:** 2026-10-17
**Lane:** Platform · **Fixes:** the open items from the 058 settings review (032, 035)

## Problem

The 058 review (5-round cap) left 2 blockers and 9 majors open in the retention, erasure and API code that is already on main. Erasure doesn't honour matter holds on the rows it changes. It misses approver, logger and lead columns, and it wipes other people's attribution. Some listings truncate silently. A client can dodge the page rate limit with a header. Domain refusals return 500. A missing signing secret switches webhooks off. Replay protection for GitHub and Graph webhooks expires. Production is held on 051 until these are fixed. The source is `058-settings-review-2/follow-ups.md`, under "Open after the 5-round cap".

## Mock Delta

None. Fixes only.

## Acceptance Criteria

1. **AC-1** One hold predicate covers every write path (purge, erasure, anonymise). Person holds store the user id and re-resolve it on every read. `held()` returns the resolved match. A table test runs purge and erasure against person and matter holds, including ids the person gained after the hold was placed.
2. **AC-2** Retention rules list every personal column in `subject` or `subjectName`, including `time.week.decided_by`, `time.entry.logged_by` and `presales.opportunity.lead_name`. The module-standard check fails a rule that lists a personal column in `fields` but not in a subject. Erasure anonymises per column, so erasing an employee leaves the PM's and the approver's attribution alone and does clear the employee's own `person_id`.
3. **AC-3** Name-only rows and access packages never truncate silently. They are counted first, and a request above the limit is paged or refused, with the reason shown.
4. **AC-4** The page rate limit can't be skipped with a header. `next-action` is exempt only on POST, and prefetches are counted in their own budget. A test sends a GET with spoofed headers and is limited.
5. **AC-5** 429 counts are recorded on the request path (`after()`/`waitUntil`) or flushed when a 429 is answered, never only on a timer.
6. **AC-6** REST maps non-retryable domain refusals (`retryable === false`, `PrivacyError`) to 400 or 409 with their message, not 500.
7. **AC-7** Subscribing to a webhook without an `amax-webhook` signing secret is refused. A missing secret at delivery is not counted as a receiver failure and doesn't switch the webhook off.
8. **AC-8** Replay protection for GitHub and Graph webhooks (which carry no signed timestamp) doesn't expire. Their dedupe rows are kept outside the purge, or replaced with a durable key, and a test replays a delivery after the P90D floor and is refused.
9. **AC-9** Each fix has a table-driven test that fails without it. Typecheck, unit tests, lint and both e2e suites stay green.

## Tasks

## Verify
