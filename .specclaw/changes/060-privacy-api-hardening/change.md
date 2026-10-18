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

- [x] `T1` — One hold predicate for purge, erasure and name rows; person holds re-resolve the user id on read (AC-1, AC-9)
  Files: packages/core/src/privacy/holds.ts, packages/core/src/privacy/match.ts, packages/core/src/privacy/complete.ts, packages/core/src/privacy/purge.ts, packages/core/src/privacy/name-rows.ts, packages/core/tests/privacy-060-holds.test.ts
- [x] `T2` — Every personal column is a subject; erasure anonymises only the matched columns; check fails a rule that breaks this (AC-2, AC-9)
  Files: modules/time/module.ts, modules/allocations/module.ts, modules/presales/module.ts, modules/delivery/module.ts, packages/core/src/module.ts, packages/core/src/privacy/apply.ts, scripts/check-module-standard.mjs, packages/core/tests/privacy-060-columns.test.ts
  Depends: T1
- [x] `T3` — Name-only rows and access packages count first, and page or refuse above the limit with the reason shown (AC-3, AC-9)
  Files: packages/core/src/privacy/name-rows.ts, packages/core/src/privacy/package.ts, packages/core/src/privacy/inventory.ts, packages/core/tests/privacy-060-limits.test.ts
  Depends: T1
- [x] `T4` — Page rate limit: `next-action` exempt only on POST, prefetches in their own budget (AC-4, AC-9)
  Files: packages/core/src/rate-limit.ts, packages/core/tests/rate-limit-060.test.ts
- [x] `T5` — 429 counts written on the request path or flushed on a 429, not only by timer (AC-5, AC-9)
  Files: packages/api/src/limits.ts, packages/api/tests/ac5-rate-limits.test.ts
- [x] `T6` — REST maps non-retryable domain refusals to 400/409 with their message (AC-6, AC-9)
  Files: packages/api/src/rest.ts, packages/api/tests/ac1-rest.test.ts
- [x] `T7` — Subscribing without a signing secret is refused; a missing secret at delivery doesn't count toward switch-off (AC-7, AC-9)
  Files: packages/api/src/webhooks.ts, packages/api/src/deliver.ts, packages/api/tests/ac4-outgoing.test.ts
- [x] `T8` — Durable replay keys for GitHub and Graph webhooks, outside the retention purge (AC-8, AC-9)
  Files: packages/db/migrations/0026_api_replay.sql, packages/api/src/module.ts, packages/api/src/inbound.ts, packages/api/tests/ac3-incoming.test.ts
- [x] `T9` — Full gates: typecheck, unit tests, lint, module-standard check, guest and signed-in e2e (AC-9)
  Files: .specclaw/changes/060-privacy-api-hardening/change.md
  Depends: T1, T2, T3, T4, T5, T6, T7, T8

## Verify

**Verdict:** PASS

- AC-1: pass — `packages/core/tests/privacy-060-holds.test.ts`: a table over (person hold before, matter hold on a project) × (purge, erasure); a person hold also holds an id gained after it was placed, and refuses that person's erasure; rows a matter hold kept are stored as `kept: legal hold`. `held()` re-resolves `subject_user_id` (migration `0026_hold_person.sql`).
- AC-2: pass — `privacy-060-columns.test.ts`: erasing the employee clears their name, note and own `person_id` and keeps the approver's `decided_by`/`updated_by`; erasing the approver clears only theirs. `defineModule` refuses a rule with an unfound personal column, and `check-module-standard.mjs` flags it (it found 6 on main; fixed in time, presales, delivery and allocations).
- AC-3: pass — `privacy-060-limits.test.ts`: 501 name-only rows and a 5003-row package section are refused with the reason (read and complete), and the request stays open.
- AC-4: pass — `rate-limit-pages.test.ts`: a GET with a spoofed `next-action` is limited; prefetches draw on their own budget (10× pages) and stop at it; only POST server actions are exempt.
- AC-5: pass — `packages/api/tests/ac5-rate-limits.test.ts`: the 429 counts reach `api.rate_limited` through the promises handed to the deferrer, with no timer or manual flush; the web app hands them to `after()`.
- AC-6: pass — `ac1-rest.test.ts`: a refusal with `retryable === false` answers 409 with its message; an unexpected error stays 500 without its message.
- AC-7: pass — `ac4-outgoing.test.ts`: without the signing secret, subscribing is refused, and 6 deliveries leave the webhook active with 0 failures.
- AC-8: pass — `ac3-incoming.test.ts`: a GitHub and a Graph call replayed after their `api.inbound` log was purged (aged past P90D and deleted) is still a duplicate (`api.replay_key`, migration `0027_api_replay.sql`, backfilled from the log).
- AC-9: pass — each fix has a test that fails without it; the commands below all exit 0.

Commands (exit 0, `DATABASE_MIGRATE_URL` on a private Postgres): `pnpm lint` (graph check ok), `pnpm turbo run test --concurrency=1` (all packages), `node scripts/check-module-standard.mjs`, `pnpm build`, `pnpm --filter @amax/web e2e` (1 passed, no `DATABASE_URL`, as in CI), `pnpm --filter @amax/web e2e:auth` (57 passed).
`specclaw-preset-check .` exits 1 on the repo-wide comment and line-length convention (861 on the tree; in this change's files only lines it inherited, plus the existing `check-module-standard.mjs` length). Quality: not_run (`specclaw-quality-scan` fails with "jq: Argument list too long" on this repo).
Screenshots: none; this change has no UI (Mock Delta: none).
Review: not run per change; the operator runs specclaw-review once per module end.
